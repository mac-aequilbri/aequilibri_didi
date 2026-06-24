import type Anthropic from "@anthropic-ai/sdk";
import { airtableEnabled, core } from "@/lib/airtable";
import { callClaudeConversation } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { normalizeTeamRole } from "@/lib/platform/module1Governance";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { Actor, OrgCtx } from "@/lib/platform/types";
import type { RecordId } from "@/lib/platform/recordWriter";
import { learningPromptText } from "../learning";
import { executeToolUse, ToolOutcome } from "./executor";
import { ASSISTANT_TOOLS } from "./tools";

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;

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
  const rows = await core.list(ctx.orgSlug, "CHAT_MESSAGES", { maxRecords: 1000 });
  return rows
    .filter((r) => str(r["Session_Id"]) === String(sessionId))
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
      core.list(ctx.orgSlug, "ACTION_HUB", { maxRecords: 1000 }),
      core.list(ctx.orgSlug, "PENDING_WRITES", { maxRecords: 1000 }),
    ]);
    const openActions = actions.filter((a) => {
      const s = str(a["Status"]);
      return s === "Open" || s === "In Progress";
    }).length;
    const pendingProposals = pending.filter((p) => str(p["Status"]).toLowerCase() === "proposed").length;
    return [
      `Jobs: ${JSON.stringify(jobs)}`,
      `Open actions: ${openActions}. Pending write proposals awaiting human approval: ${pendingProposals}.`,
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
  opts: { sessionId?: RecordId; jobId?: RecordId; userRole?: string } = {},
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
      `If role is broker, do not attempt write tools (read/query only).`,
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
  const outcomes: ToolOutcome[] = [];
  let reply = "";
  let demoMode = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await callClaudeConversation(system, convo, {
      tools: ASSISTANT_TOOLS,
      maxTokens: 1500,
      model: modelFor("chat"),
    });
    demoMode = res.demo_mode;
    if (res.demo_mode || res.tool_uses.length === 0 || round === MAX_TOOL_ROUNDS) {
      reply = res.content;
      break;
    }

    // Echo the assistant turn (text + tool_use blocks), then answer each
    // tool_use with a tool_result so the model can continue.
    const assistantBlocks: Anthropic.ContentBlockParam[] = [];
    if (res.content.trim()) assistantBlocks.push({ type: "text", text: res.content });
    const resultBlocks: Anthropic.ContentBlockParam[] = [];
    for (const tu of res.tool_uses) {
      if (!tu.id) continue;
      assistantBlocks.push({
        type: "tool_use",
        id: tu.id,
        name: tu.name,
        input: tu.input ?? {},
      });
      const outcome = await executeToolUse(ctx, actor, tu, opts.userRole);
      outcomes.push(outcome);
      resultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: outcome.summary,
        is_error: !outcome.ok,
      });
    }
    if (!resultBlocks.length) {
      reply = res.content;
      break;
    }
    convo.push({ role: "assistant", content: assistantBlocks });
    convo.push({ role: "user", content: resultBlocks });
  }

  const pendingApprovals = outcomes
    .filter((o) => o.status === "proposed" && o.proposalId)
    .map((o) => o.proposalId!);

  if (airtableEnabled()) {
    await core.create(ctx.orgSlug, "CHAT_MESSAGES", {
      Session_Id: String(sessionId),
      Role: "assistant",
      Content: reply || "(no reply)",
      Tool_Calls: JSON.stringify(
        outcomes.map((o) => ({
          tool: o.toolName,
          ok: o.ok,
          status: o.status,
          proposalId: o.proposalId,
          recordId: o.recordId,
        })),
      ),
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
        toolCalls: JSON.stringify(
          outcomes.map((o) => ({
            tool: o.toolName,
            ok: o.ok,
            status: o.status,
            proposalId: o.proposalId,
            recordId: o.recordId,
          })),
        ),
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
