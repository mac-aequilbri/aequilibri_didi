// Executes assistant tool calls. Reads run directly (org-scoped); writes go
// through recordWriter under the org's aiAuthority policy — executed
// immediately or persisted as a "proposed" ExecutionLog row for human
// approval. This is the step UC2/UC3 never had: tagged chat outputs become
// real database rows.

import { prisma } from "@/lib/db";
import type { ToolUse } from "@/lib/claude";
import { writeRecord, WritableTable } from "@/lib/platform/recordWriter";
import { Actor, AiAuthority, OrgCtx } from "@/lib/platform/types";
import { nextRuleCode } from "../learning";
import { TOOL_POLICY } from "./tools";

export interface ToolOutcome {
  toolName: string;
  ok: boolean;
  /** Sent back to the model as the tool_result content. */
  summary: string;
  status?: "executed" | "proposed";
  execLogId?: number;
  recordId?: number;
}

function requiresApproval(authority: AiAuthority, risk: string): boolean {
  if (risk === "read") return false;
  if (authority === "auto_low_risk") return risk === "high_write";
  return true; // propose_only / approve_required
}

const QUERYABLE = {
  jobs: () =>
    ({ model: prisma.platJob, select: { id: true, code: true, name: true, engagementType: true, status: true, completionPct: true, budgetTotal: true } }),
  actions: () =>
    ({ model: prisma.platActionHub, select: { id: true, jobId: true, title: true, priority: true, status: true, owner: true, dueDate: true } }),
  decisions: () =>
    ({ model: prisma.platDecision, select: { id: true, jobId: true, description: true, status: true, madeBy: true, category: true } }),
  phases: () =>
    ({ model: prisma.platConPhase, select: { id: true, jobId: true, name: true, status: true, completionPct: true, sortOrder: true, isAiDraft: true } }),
  budget_lines: () =>
    ({ model: prisma.platConBudgetLine, select: { id: true, jobId: true, phaseId: true, category: true, description: true, budgetAmount: true, committedAmount: true, actualAmount: true } }),
  cashflows: () =>
    ({ model: prisma.platConCashflow, select: { id: true, jobId: true, period: true, projected: true, actual: true } }),
  risks: () =>
    ({ model: prisma.platConRisk, select: { id: true, jobId: true, description: true, likelihood: true, impact: true, status: true, owner: true } }),
  variations: () =>
    ({ model: prisma.platConVariationOrder, select: { id: true, jobId: true, refNumber: true, title: true, costImpact: true, timeImpactDays: true, status: true } }),
  procurement: () =>
    ({ model: prisma.platConProcurement, select: { id: true, jobId: true, item: true, vendorName: true, total: true, status: true, dueDate: true } }),
  vendors: () =>
    ({ model: prisma.platConVendor, select: { id: true, name: true, category: true, rating: true, isActive: true } }),
  learning_rules: () =>
    ({ model: prisma.platLearningRule, select: { id: true, ruleCode: true, kind: true, description: true, confidence: true, isActive: true } }),
} as const;

async function runQuery(ctx: OrgCtx, input: Record<string, unknown>): Promise<string> {
  const table = String(input.table ?? "");
  const def = QUERYABLE[table as keyof typeof QUERYABLE];
  if (!def) return `Unknown table "${table}".`;
  const { model, select } = def();
  const where: Record<string, unknown> = { orgId: ctx.orgId };
  if (typeof input.jobId === "number" && table !== "jobs" && table !== "vendors" && table !== "learning_rules") {
    where.jobId = input.jobId;
  }
  if (typeof input.status === "string" && input.status) where.status = input.status;
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const rows = await (model as any).findMany({ where, select, take: limit, orderBy: { id: "desc" } });
  return JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
}

/** Per-tool input massaging: stamp provenance flags, allocate rule codes. */
async function toWriteData(
  ctx: OrgCtx,
  toolName: string,
  input: Record<string, unknown>,
  actor: Actor,
): Promise<Record<string, unknown>> {
  const data = { ...input };
  delete data.recordId;
  switch (toolName) {
    case "create_action":
      data.sourceType = "chat";
      data.sourceId = actor.sourceMessageId;
      break;
    case "save_decision":
      data.sourceType = "chat";
      data.sourceId = actor.sourceMessageId;
      data.madeBy = data.madeBy || actor.name;
      break;
    case "create_risk":
      data.createdByAi = true;
      break;
    case "create_variation_draft":
      data.isAiDrafted = true;
      data.status = "draft";
      data.submittedBy = actor.name;
      break;
    case "propose_rule":
      data.kind = "guidance";
      data.ruleCode = await nextRuleCode(ctx.orgId);
      data.notes = "Proposed by the assistant in chat.";
      break;
  }
  return data;
}

export async function executeToolUse(
  ctx: OrgCtx,
  actor: Actor,
  tu: ToolUse,
): Promise<ToolOutcome> {
  const policy = TOOL_POLICY[tu.name];
  if (!policy) {
    return { toolName: tu.name, ok: false, summary: `Unknown tool "${tu.name}".` };
  }
  const input = (tu.input ?? {}) as Record<string, unknown>;

  if (policy.risk === "read") {
    try {
      return { toolName: tu.name, ok: true, summary: await runQuery(ctx, input) };
    } catch (err) {
      return { toolName: tu.name, ok: false, summary: `Query failed: ${err}` };
    }
  }

  const table = policy.table as WritableTable;
  const op = policy.op ?? "create";
  try {
    const data = await toWriteData(ctx, tu.name, input, actor);
    const result = await writeRecord(ctx, {
      table,
      op,
      recordId: op === "update" ? Number(input.recordId) : undefined,
      data,
      actor,
      requireApproval: requiresApproval(ctx.aiAuthority, policy.risk),
    });
    const summary =
      result.status === "proposed"
        ? `Proposal #${result.execLogId} recorded — a human must approve before the ${op} on ${table} is applied. Tell the user it is pending approval.`
        : `${op} on ${table} executed (record id ${result.recordId}).`;
    return { toolName: tu.name, ok: true, summary, status: result.status, execLogId: result.execLogId, recordId: result.recordId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { toolName: tu.name, ok: false, summary: `Write rejected: ${message.slice(0, 400)}` };
  }
}
