// Conversational Assistant (module 7): in-context chat with real persistence.
// The assistant knows the current org/job, the active learning rules, and the
// recent history; outputs are saved through tool calls (executor.ts), gated by
// the org's aiAuthority policy. Demo mode (no API key) returns simulated
// replies and never executes tools.

import type Anthropic from "@anthropic-ai/sdk";
import { callClaudeConversation } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { Actor, OrgCtx } from "@/lib/platform/types";
import { learningPromptText } from "../learning";
import { executeToolUse, ToolOutcome } from "./executor";
import { ASSISTANT_TOOLS } from "./tools";

const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 4;

export async function getOrCreateSession(ctx: OrgCtx, jobId?: number): Promise<number> {
  const open = await prisma.platChatSession.findFirst({
    where: { orgId: ctx.orgId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open) return open.id;
  const session = await prisma.platChatSession.create({
    data: { orgId: ctx.orgId, jobId, title: "Session" },
  });
  return session.id;
}

export async function endSession(ctx: OrgCtx, sessionId: number): Promise<void> {
  await prisma.platChatSession.updateMany({
    where: { id: sessionId, orgId: ctx.orgId },
    data: { endedAt: new Date() },
  });
}

export async function listMessages(ctx: OrgCtx, sessionId: number) {
  return prisma.platChatMessage.findMany({
    where: { orgId: ctx.orgId, sessionId },
    orderBy: { createdAt: "asc" },
  });
}

/** Compact data context so the model grounds its answers in real records. */
async function dataContext(ctx: OrgCtx): Promise<string> {
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
  sessionId: number;
  reply: string;
  demoMode: boolean;
  outcomes: ToolOutcome[];
  pendingApprovals: number[];
}

export async function sendChatMessage(
  ctx: OrgCtx,
  userName: string,
  text: string,
  opts: { sessionId?: number; jobId?: number } = {},
): Promise<SendResult> {
  const sessionId = opts.sessionId ?? (await getOrCreateSession(ctx, opts.jobId));

  const userMsg = await prisma.platChatMessage.create({
    data: { orgId: ctx.orgId, sessionId, role: "user", content: text },
  });

  const [rulesBlock, context, historyRows] = await Promise.all([
    learningPromptText(ctx),
    dataContext(ctx),
    prisma.platChatMessage.findMany({
      where: { orgId: ctx.orgId, sessionId, id: { lt: userMsg.id } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    }),
  ]);

  const { system, version } = getPrompt("assistant.chat", {
    persona: ctx.config.assistant.persona,
    orgName: ctx.orgName,
    jobLine: opts.jobId ? ` (current job id ${opts.jobId})` : "",
    rulesBlock: [rulesBlock, `Current data snapshot:\n${context}`].filter(Boolean).join("\n\n"),
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
    sourceMessageId: userMsg.id,
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
      const outcome = await executeToolUse(ctx, actor, tu);
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

  await prisma.platChatMessage.create({
    data: {
      orgId: ctx.orgId,
      sessionId,
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

  // Audit the conversational turn itself (prompt version for traceability).
  await prisma.platExecutionLog
    .create({
      data: {
        orgId: ctx.orgId,
        jobId: opts.jobId,
        actorType: "ai",
        actorName: ctx.config.assistant.name,
        operation: "chat",
        targetTable: "plat_core_chatmessage",
        payload: JSON.stringify({ user: userName, tools: outcomes.length, demoMode }),
        status: "executed",
        executedAt: new Date(),
        sourceMessageId: userMsg.id,
        promptVersion: version,
      },
    })
    .catch(() => {});

  return { sessionId, reply, demoMode, outcomes, pendingApprovals };
}
