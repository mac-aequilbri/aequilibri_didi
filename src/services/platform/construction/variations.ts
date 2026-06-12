// Variation orders — AI drafting with defensive JSON parsing, human approval
// with correction capture when the approver edits the AI's numbers.

import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { emitCorrection } from "@/lib/platform/corrections";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord } from "@/lib/platform/recordWriter";
import { Actor, OrgCtx } from "@/lib/platform/types";
import { toNum } from "@/lib/format";

async function nextRefNumber(orgId: number, jobId: number): Promise<string> {
  // Max existing suffix + 1 — count-based numbering duplicates after deletes.
  const existing = await prisma.platConVariationOrder.findMany({
    where: { orgId, jobId },
    select: { refNumber: true },
  });
  const max = existing.reduce((m, v) => {
    const match = /-(\d+)$/.exec(v.refNumber);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `VO-${String(jobId).padStart(3, "0")}-${String(max + 1).padStart(3, "0")}`;
}

export async function aiDraftVariation(
  ctx: OrgCtx,
  actorName: string,
  jobId: number,
  brief: string,
): Promise<{ id?: number; demoMode: boolean }> {
  const job = await prisma.platJob.findFirst({
    where: { id: jobId, orgId: ctx.orgId },
    include: {
      conPhases: { select: { name: true, status: true, completionPct: true } },
      conBudgets: { select: { category: true, budgetAmount: true, actualAmount: true } },
    },
  });
  if (!job) throw new Error("Job not found");

  const { system } = getPrompt("variations.draft");
  const context = JSON.stringify(
    {
      job: { name: job.name, budgetTotal: toNum(job.budgetTotal) },
      phases: job.conPhases,
      budget: job.conBudgets.map((b) => ({
        category: b.category,
        budget: toNum(b.budgetAmount),
        actual: toNum(b.actualAmount),
      })),
    },
    null,
    0,
  );
  const res = await callClaude(system, `Project context: ${context}\n\nVariation brief: ${brief}`, {
    model: modelFor("drafting"),
    maxTokens: 800,
  });

  let draft: {
    title: string;
    description: string;
    scopeChange: string;
    costImpact: number;
    timeImpactDays: number;
    basis?: string;
  };
  try {
    const parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
    draft = {
      title: String(parsed.title || brief.slice(0, 120)),
      description: String(parsed.description ?? ""),
      scopeChange: String(parsed.scopeChange ?? ""),
      // Claude may return strings despite the schema — coerce defensively.
      costImpact: Number(parsed.costImpact) || 0,
      timeImpactDays: Math.round(Number(parsed.timeImpactDays) || 0),
      basis: parsed.basis ? String(parsed.basis) : undefined,
    };
  } catch {
    draft = {
      title: brief.slice(0, 120),
      description: res.demo_mode
        ? "Demo mode — no API key. Edit this draft manually."
        : `AI draft could not be parsed; raw output:\n${res.content.slice(0, 800)}`,
      scopeChange: "",
      costImpact: 0,
      timeImpactDays: 0,
    };
  }

  const actor: Actor = { type: "ai", name: actorName };
  const result = await writeRecord(ctx, {
    table: "variation_order",
    op: "create",
    data: {
      jobId,
      refNumber: await nextRefNumber(ctx.orgId, jobId),
      title: draft.title,
      description: draft.description,
      scopeChange: draft.scopeChange,
      costImpact: draft.costImpact,
      timeImpactDays: draft.timeImpactDays,
      status: "submitted",
      isAiDrafted: true,
      aiDraft: JSON.stringify({ ...draft, brief, demoMode: res.demo_mode }),
      submittedBy: actorName,
    },
    actor,
    // The VO lifecycle (submitted → approved/rejected) is itself the human
    // gate, so the draft row is written directly rather than proposed.
    requireApproval: false,
  });
  return { id: result.recordId, demoMode: res.demo_mode };
}

/** Approve a variation; if the approver edited the AI's numbers, the deltas
 *  are captured as corrections so the learning loop can cluster them. */
export async function approveVariation(
  ctx: OrgCtx,
  approverName: string,
  id: number,
  edits: { costImpact?: number; timeImpactDays?: number } = {},
): Promise<void> {
  const vo = await prisma.platConVariationOrder.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!vo) throw new Error("Variation not found");

  const finalCost = edits.costImpact ?? toNum(vo.costImpact);
  const finalDays = edits.timeImpactDays ?? vo.timeImpactDays;

  await writeRecord(ctx, {
    table: "variation_order",
    op: "update",
    recordId: id,
    data: {
      status: "approved",
      approvedBy: approverName,
      approvedAt: new Date().toISOString(),
      costImpact: finalCost,
      timeImpactDays: finalDays,
    },
    actor: { type: "human", name: approverName },
  });

  if (vo.isAiDrafted) {
    const actor: Actor = { type: "human", name: approverName };
    if (finalCost !== toNum(vo.costImpact)) {
      await emitCorrection(ctx, actor, {
        jobId: vo.jobId,
        entityType: "variation_order",
        entityId: vo.id,
        dimension: "variation.cost_impact",
        aiValue: toNum(vo.costImpact),
        humanValue: finalCost,
        rootCause: "approver adjusted AI cost estimate",
      });
    }
    if (finalDays !== vo.timeImpactDays) {
      await emitCorrection(ctx, actor, {
        jobId: vo.jobId,
        entityType: "variation_order",
        entityId: vo.id,
        dimension: "variation.time_impact_days",
        aiValue: vo.timeImpactDays,
        humanValue: finalDays,
        rootCause: "approver adjusted AI time estimate",
      });
    }
  }
}

export async function rejectVariation(
  ctx: OrgCtx,
  rejectorName: string,
  id: number,
): Promise<void> {
  await writeRecord(ctx, {
    table: "variation_order",
    op: "update",
    recordId: id,
    data: { status: "rejected", approvedBy: rejectorName },
    actor: { type: "human", name: rejectorName },
  });
}
