import type Anthropic from "@anthropic-ai/sdk";
import type { ChatStreamEvent } from "@/lib/claude";
import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { normalizeTeamRole } from "@/lib/platform/module1Governance";
import { isPlatformAdmin } from "@/lib/platform/org-context";
import { getPrompt } from "@/lib/platform/prompts";
import { Actor, OrgCtx } from "@/lib/platform/types";
import type { RecordId } from "@/lib/platform/recordWriter";
import { learningPromptText } from "../learning";
import type { ToolOutcome } from "./executor";
import { runOrchestrator, type Specialist } from "../agents/orchestrator";
import { SPECIALISTS } from "../agents/registry";
import { PROPOSED_PENDING_FORMULA } from "@/lib/platform/pendingWritesSource";

const HISTORY_LIMIT = 20;

const formulaSafe = (v: string): string => v.replace(/'/g, "");
const OPEN_ISSUES_FORMULA = `OR({Status}='Open',{Status}='In Progress')`;

/** Scalar fields worth grounding on — omits the many link arrays that make a
 *  raw JOBS row huge in the prompt. */
const JOB_SUMMARY_FIELDS = [
  "Job_Name",
  "Status",
  "Target_Completion",
  "Outcome",
  "Estimated_Value",
  "Actual_Value",
  "Variance_Percent",
] as const;

function compactJob(job: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id: job.id };
  for (const k of JOB_SUMMARY_FIELDS) if (job[k] != null) out[k] = job[k];
  return out;
}

interface ChatMessageRow {
  id: RecordId;
  role: string;
  content: string;
  toolCalls: string;
  createdAt: Date;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function dt(v: unknown): Date {
  const s = str(v);
  const d = s ? new Date(s) : new Date(0);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

async function listSessionMessagesAirtable(ctx: OrgCtx, sessionId: RecordId): Promise<ChatMessageRow[]> {
  const rows = await core.list(ctx.orgSlug, "CHAT_MESSAGES", {
    filterByFormula: `{Session_Id}='${formulaSafe(String(sessionId))}'`,
  });
  return rows
    .map((r) => ({
      id: r.id,
      role: str(r["Role"]),
      content: str(r["Content"]),
      toolCalls: str(r["Tool_Calls"]) || "[]",
      createdAt: dt(r["Created_At"]),
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function getOrCreateSession(ctx: OrgCtx, jobId?: RecordId): Promise<RecordId> {
  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "CHAT_SESSIONS", { maxRecords: 200 });
    const open = rows
      .filter((r) => !str(r["Ended_At"]))
      .sort((a, b) => dt(b["Started_At"]).getTime() - dt(a["Started_At"]).getTime())[0];
    if (open) return open.id;
    const created = await core.create(ctx.orgSlug, "CHAT_SESSIONS", {
      Session_Title: "Session",
      Job_Id: jobId == null ? "" : String(jobId),
      Started_At: new Date().toISOString(),
      Summary: "",
    });
    return created.id;
  }
  const open = await prisma.platChatSession.findFirst({
    where: { orgId: ctx.orgId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open) return open.id;
  const session = await prisma.platChatSession.create({
    data: { orgId: ctx.orgId, jobId: typeof jobId === "number" ? jobId : undefined, title: "Session" },
  });
  return session.id;
}

export async function endSession(ctx: OrgCtx, sessionId: RecordId): Promise<void> {
  if (airtableEnabled()) {
    await core.update(ctx.orgSlug, "CHAT_SESSIONS", String(sessionId), {
      Ended_At: new Date().toISOString(),
    });
    return;
  }
  await prisma.platChatSession.updateMany({
    where: { id: Number(sessionId), orgId: ctx.orgId },
    data: { endedAt: new Date() },
  });
}

export async function listMessages(ctx: OrgCtx, sessionId: RecordId): Promise<ChatMessageRow[]> {
  if (airtableEnabled()) {
    return listSessionMessagesAirtable(ctx, sessionId);
  }
  const rows = await prisma.platChatMessage.findMany({
    where: { orgId: ctx.orgId, sessionId: Number(sessionId) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls,
    createdAt: m.createdAt,
  }));
}

/** Compact data context so the model grounds its answers in real records. */
async function dataContext(ctx: OrgCtx): Promise<string> {
  if (airtableEnabled()) {
    const [jobs, actions, pending] = await Promise.all([
      core.list(ctx.orgSlug, "JOBS", { maxRecords: 10 }),
      core.list(ctx.orgSlug, "ISSUES", { filterByFormula: OPEN_ISSUES_FORMULA }),
      core.list(ctx.orgSlug, "PENDING_WRITES", { filterByFormula: PROPOSED_PENDING_FORMULA }),
    ]);
    return [
      `Jobs: ${JSON.stringify(jobs.map(compactJob))}`,
      `Open actions: ${actions.length}. Pending write proposals awaiting human approval: ${pending.length}.`,
    ].join("\n");
  }
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    select: {
      id: true,
      code: true,
      name: true,
      engagementType: true,
      status: true,
      completionPct: true,
      budgetTotal: true,
    },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });
  const [openActions, pendingProposals] = await Promise.all([
    prisma.platActionHub.count({
      where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] } },
    }),
    prisma.platPendingWrite.count({ where: { orgId: ctx.orgId, status: "proposed" } }),
  ]);
  return [
    `Jobs: ${JSON.stringify(jobs, (_k, v) => (typeof v === "bigint" ? Number(v) : v))}`,
    `Open actions: ${openActions}. Pending write proposals awaiting human approval: ${pendingProposals}.`,
  ].join("\n");
}

export interface SendResult {
  sessionId: RecordId;
  reply: string;
  demoMode: boolean;
  outcomes: ToolOutcome[];
  pendingApprovals: RecordId[];
}

export async function sendChatMessage(
  ctx: OrgCtx,
  userName: string,
  text: string,
  opts: {
    sessionId?: RecordId;
    jobId?: RecordId;
    userRole?: string;
    onEvent?: (e: ChatStreamEvent) => void;
  } = {},
): Promise<SendResult> {
  const sessionId = opts.sessionId ?? (await getOrCreateSession(ctx, opts.jobId));
  let userMsgId: number | undefined;
  let userMsgRecordId: string | undefined;
  if (airtableEnabled()) {
    const userMsg = await core.create(ctx.orgSlug, "CHAT_MESSAGES", {
      Session_Id: String(sessionId),
      Role: "user",
      Content: text,
      Tool_Calls: "[]",
      Created_At: new Date().toISOString(),
    });
    userMsgRecordId = userMsg.id;
  } else {
    const userMsg = await prisma.platChatMessage.create({
      data: { orgId: ctx.orgId, sessionId: Number(sessionId), role: "user", content: text },
    });
    userMsgId = userMsg.id;
  }

  const [rulesBlock, context, historyRows] = await Promise.all([
    learningPromptText(ctx),
    dataContext(ctx),
    airtableEnabled()
      ? listSessionMessagesAirtable(ctx, sessionId).then((rows) =>
          rows.filter((m) => String(m.id) !== String(userMsgRecordId)).slice(-HISTORY_LIMIT).reverse(),
        )
      : prisma.platChatMessage.findMany({
          where: { orgId: ctx.orgId, sessionId: Number(sessionId), id: { lt: userMsgId! } },
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
        }),
  ]);

  const { system, version } = getPrompt("assistant.chat", {
    persona: ctx.config.assistant.persona,
    orgName: ctx.orgName,
    jobLine: opts.jobId ? ` (current job id ${opts.jobId})` : "",
    rulesBlock: [
      rulesBlock,
      `Current user role: ${normalizeTeamRole(opts.userRole ?? "broker")}.`,
      `Role access is enforced server-side: owner has full access; builder writes actions/workstreams only (no budget, risks, decisions, or rules); architect additionally drafts variations but has no financial access; broker is read-only except raising an action to flag a decision needed. Financial tables (budget, cashflow) and learning rules are readable by the owner only — for other roles, answer without that data and note it is owner-restricted.`,
      `Current data snapshot:\n${context}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const convo: Anthropic.MessageParam[] = [
    ...historyRows
      .reverse()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content || "…" })),
    { role: "user", content: text },
  ];

  const actor: Actor = {
    type: "ai",
    name: ctx.config.assistant.name,
    role: opts.userRole,
    sourceMessageId: userMsgId,
  };

  // Route the turn through the orchestrator across all registered specialists.
  // Each specialist shares the same grounded base prompt (persona, rules, data
  // snapshot) plus a scope line; its tool bundle is what actually constrains it.
  // Every specialist write still passes the shared aiAuthority + role gate. The
  // Onboarding agent (Module 1) is platform-admin only, so it's excluded here
  // for everyone else (the executor re-checks on the tool itself).
  const platformAdmin = await isPlatformAdmin();
  const specialists: Specialist[] = SPECIALISTS.filter(
    (agent) => agent.key !== "onboarding" || platformAdmin,
  ).map((agent) => ({
    agent,
    system: `${system}\n\nYou are the ${agent.label} specialist for this workspace. Scope: ${agent.description} Use only the tools you have been given; if a request falls outside your scope, say so briefly so it can be routed elsewhere.`,
  }));
  const { reply, demoMode, outcomes, delegations } = await runOrchestrator(ctx, convo, actor, {
    specialists,
    orgName: ctx.orgName,
    userRole: opts.userRole,
    onEvent: opts.onEvent,
  });

  const pendingApprovals = outcomes
    .filter((o) => o.status === "proposed" && o.proposalId)
    .map((o) => o.proposalId!);

  // Trace: prepend a "delegated" marker per specialist the orchestrator routed
  // to, then the executed/proposed tool calls. Empty in single-specialist mode.
  const toolTrace = [
    ...delegations.map((d) => ({ tool: `→ ${d.label}`, ok: true, status: "delegated" as const })),
    ...outcomes.map((o) => ({
      tool: o.toolName,
      ok: o.ok,
      status: o.status,
      proposalId: o.proposalId,
      recordId: o.recordId,
    })),
  ];

  if (airtableEnabled()) {
    await core.create(ctx.orgSlug, "CHAT_MESSAGES", {
      Session_Id: String(sessionId),
      Role: "assistant",
      Content: reply || "(no reply)",
      Tool_Calls: JSON.stringify(toolTrace),
      Created_At: new Date().toISOString(),
    });
    await core
      .create(ctx.orgSlug, "EXECUTION_LOG", {
        Log_Entry: "chat",
        Action_Type: "chat",
        Tables_Affected: "CHAT_MESSAGES",
        Summary: JSON.stringify({ user: userName, tools: outcomes.length, demoMode }),
        Initiated_By: "AI",
        Status: "executed",
        Date_Time: new Date().toISOString(),
      })
      .catch(() => {});
  } else {
    await prisma.platChatMessage.create({
      data: {
        orgId: ctx.orgId,
        sessionId: Number(sessionId),
        role: "assistant",
        content: reply || "(no reply)",
        toolCalls: JSON.stringify(toolTrace),
      },
    });
    await prisma.platExecutionLog
      .create({
        data: {
          orgId: ctx.orgId,
          jobId: typeof opts.jobId === "number" ? opts.jobId : undefined,
          actorType: "ai",
          actorName: ctx.config.assistant.name,
          operation: "chat",
          targetTable: "plat_core_chatmessage",
          payload: JSON.stringify({ user: userName, tools: outcomes.length, demoMode }),
          status: "executed",
          executedAt: new Date(),
          sourceMessageId: userMsgId,
          promptVersion: version,
        },
      })
      .catch(() => {});
  }

  return { sessionId, reply, demoMode, outcomes, pendingApprovals };
}
