// UC1 session init/close protocol — converts persistent memory into working memory
// and writes episodic records back at close time.
// See: aequilibri Memory Architecture — Session Initialisation Protocol

import { prisma } from "@/lib/db";
import { applyRules, snapshotIntelligence } from "./learning";

// ── Session Init ─────────────────────────────────────────────────────
// Step 1-5 of the Session Initialisation Protocol.
// Returns everything Claude needs loaded into working memory.

export async function initSession(address?: string, suburb?: string) {
  const [rules, workstreams, openActions, recentDecisions, snapshot] = await Promise.all([
    // Step 1 — LEARNING_RULES (Active, Priority DESC, Confidence DESC)
    prisma.uc1LearningRule.findMany({
      where: { isActive: true },
      orderBy: [{ priority: "desc" }, { confidence: "desc" }],
    }),
    // Step 2 — WORKSTREAMS (Load_at_Session_Start = true, Active)
    prisma.uc1Workstream.findMany({
      where: { loadAtSessionStart: true, status: "active" },
      orderBy: { lastUpdated: "desc" },
    }),
    // Step 3 — ACTION_HUB (Open, due today or overdue)
    prisma.uc1ActionHub.findMany({
      where: { status: "open", dueDate: { lte: new Date() } },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    }),
    // Step 4 — DECISIONS (last 10 strategic decisions)
    prisma.uc1Decision.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // Step 5 — INTELLIGENCE_SNAPSHOT (most recent)
    prisma.uc1IntelligenceSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
  ]);

  // If a property context is provided, resolve which rules apply to it.
  const applicableRules = address || suburb
    ? await applyRules({ address, suburb })
    : null;

  return {
    rules,
    applicableRules,
    workstreams,
    openActions,
    recentDecisions,
    snapshot,
    autoApplyRules: rules.filter((r) => r.autoApply),
    sessionInit: true,
  };
}

// ── Session Close ────────────────────────────────────────────────────
// Writes the episodic record for a completed session.
// Call at the end of every quoting session.

export interface SessionCloseInput {
  address: string;
  quoteId?: number;
  estimatorId?: number;
  // AI estimates
  estimatedAreaM2: number;
  estimatedValleyLm?: number;
  estimatedRidgeLm?: number;
  estimatedEaveLm?: number;
  estimatedHipLm?: number;
  estimatedTotal: number;
  // Applied rules (from initSession.applicableRules)
  rulesApplied?: string[];
  notes?: string;
}

export async function closeSession(input: SessionCloseInput): Promise<number> {
  const job = await prisma.uc1Job.create({
    data: {
      quoteId: input.quoteId ?? null,
      address: input.address,
      estimatorId: input.estimatorId ?? null,
      sessionCloseAt: new Date(),
      estimatedAreaM2: input.estimatedAreaM2,
      estimatedValleyLm: input.estimatedValleyLm ?? 0,
      estimatedRidgeLm: input.estimatedRidgeLm ?? 0,
      estimatedEaveLm: input.estimatedEaveLm ?? 0,
      estimatedHipLm: input.estimatedHipLm ?? 0,
      estimatedTotal: input.estimatedTotal,
      rulesAppliedJson: JSON.stringify(input.rulesApplied ?? []),
      status: "estimated",
      notes: input.notes ?? "",
    },
  });

  await prisma.uc1ExecutionLog.create({
    data: {
      toolName: "session_close",
      payload: JSON.stringify({ address: input.address, quoteId: input.quoteId }),
      result: JSON.stringify({ jobId: job.id }),
      status: "success",
      quoteId: input.quoteId ?? null,
    },
  });

  return job.id;
}

// ── Job complete (actual values recorded at invoice) ─────────────────
export interface JobCompleteInput {
  jobId: number;
  actualAreaM2?: number;
  actualValleyLm?: number;
  actualRidgeLm?: number;
  actualEaveLm?: number;
  actualHipLm?: number;
  actualTotal?: number;
}

export async function recordJobOutcome(input: JobCompleteInput): Promise<void> {
  const job = await prisma.uc1Job.findUnique({ where: { id: input.jobId } });
  if (!job) return;

  const variancePctArea = input.actualAreaM2 && job.estimatedAreaM2
    ? Math.round(((input.actualAreaM2 - job.estimatedAreaM2) / job.estimatedAreaM2) * 1000) / 10
    : null;
  const variancePctQuote = input.actualTotal && Number(job.estimatedTotal)
    ? Math.round(((Number(input.actualTotal) - Number(job.estimatedTotal)) / Number(job.estimatedTotal)) * 1000) / 10
    : null;

  const learningRuleCandidate =
    (variancePctArea !== null && Math.abs(variancePctArea) > 15) ||
    (variancePctQuote !== null && Math.abs(variancePctQuote) > 15);

  await prisma.uc1Job.update({
    where: { id: input.jobId },
    data: {
      actualAreaM2: input.actualAreaM2 ?? undefined,
      actualValleyLm: input.actualValleyLm ?? undefined,
      actualRidgeLm: input.actualRidgeLm ?? undefined,
      actualEaveLm: input.actualEaveLm ?? undefined,
      actualHipLm: input.actualHipLm ?? undefined,
      actualTotal: input.actualTotal ?? undefined,
      variancePctArea,
      variancePctQuote,
      learningRuleCandidate,
      status: "completed",
      completedAt: new Date(),
    },
  });

  // If variance > 25%, create an action item for immediate review.
  if (variancePctArea !== null && Math.abs(variancePctArea) > 25) {
    await prisma.uc1ActionHub.create({
      data: {
        action: `Review high-variance correction — ${job.address} (${variancePctArea > 0 ? "+" : ""}${variancePctArea}% area)`,
        priority: "P1",
        dueDate: new Date(),
        triggerCondition: "variance_pct_area > 25",
      },
    });
  }

  // Trigger snapshot if > 50 corrections exist (confidence threshold crossing).
  const correctionCount = await prisma.uc1Correction.count();
  if (correctionCount > 0 && correctionCount % 50 === 0) {
    await snapshotIntelligence();
  }
}

// ── Working-memory prompt block ──────────────────────────────────────
// Returns a formatted string Claude can consume in its context window.
export async function sessionInitPromptText(address?: string, suburb?: string): Promise<string> {
  const ctx = await initSession(address, suburb);
  const lines: string[] = ["=== SESSION INIT — Port City Roofing ===\n"];

  // Rules
  if (ctx.rules.length) {
    lines.push("ACTIVE LEARNING RULES (apply in priority order):");
    for (const r of ctx.rules.slice(0, 12)) {
      const autoFlag = r.autoApply ? " [AUTO]" : "";
      lines.push(`  [${r.ruleCode}·p${r.priority}·c${r.confidence}${autoFlag}] ${r.description}`);
    }
    lines.push("");
  }

  // Workstreams
  if (ctx.workstreams.length) {
    lines.push("ACTIVE WORKSTREAMS:");
    for (const w of ctx.workstreams) {
      lines.push(`  • ${w.name}: ${w.milestone || w.description}`);
    }
    lines.push("");
  }

  // Open actions
  if (ctx.openActions.length) {
    lines.push(`OPEN ACTIONS (${ctx.openActions.length} due/overdue):`);
    for (const a of ctx.openActions) {
      lines.push(`  [${a.priority}] ${a.action}`);
    }
    lines.push("");
  }

  // Snapshot
  if (ctx.snapshot) {
    lines.push(`INTELLIGENCE SNAPSHOT (${ctx.snapshot.capturedAt.toISOString().slice(0, 10)}):`);
    lines.push(`  Accuracy: ${ctx.snapshot.accuracyRatePct}%  Active rules: ${ctx.snapshot.activeRules}  Avg confidence: ${ctx.snapshot.avgConfidence}`);
    const gaps = JSON.parse(ctx.snapshot.gapsJson) as string[];
    if (gaps.length) lines.push(`  Known gaps: ${gaps.join("; ")}`);
    lines.push("");
  }

  lines.push("=== END SESSION INIT ===");
  return lines.join("\n");
}
