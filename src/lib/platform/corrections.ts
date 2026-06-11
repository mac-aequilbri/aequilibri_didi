// Correction event emitter (Platform Architecture doc utility layer).
// Called by any service when a human overrides an AI output, so corrections
// are captured consistently regardless of which module produced the value.
// The hypothesis engine (services/platform/learning) clusters these later.

import { prisma } from "@/lib/db";
import { Actor, OrgCtx } from "./types";

export interface CorrectionInput {
  jobId?: number;
  /** What kind of record was corrected, e.g. "budget_line", "variation_order". */
  entityType: string;
  entityId?: number;
  /** Dotted dimension key, e.g. "budget.concrete", "variation.cost_impact". */
  dimension: string;
  aiValue?: number;
  humanValue?: number;
  aiValueText?: string;
  humanValueText?: string;
  /** Required — corrections without a root cause can't become hypotheses. */
  rootCause: string;
  /** Arbitrary trigger keys for clustering, e.g. { suburb: "Dulong" }. */
  context?: Record<string, string>;
}

export async function emitCorrection(
  ctx: OrgCtx,
  actor: Actor,
  input: CorrectionInput,
): Promise<number> {
  const variancePct =
    input.aiValue != null && input.humanValue != null && input.aiValue !== 0
      ? Math.round(((input.humanValue - input.aiValue) / Math.abs(input.aiValue)) * 1000) / 10
      : null;

  const correction = await prisma.platCorrection.create({
    data: {
      orgId: ctx.orgId,
      jobId: input.jobId,
      entityType: input.entityType,
      entityId: input.entityId,
      dimension: input.dimension,
      aiValue: input.aiValue,
      humanValue: input.humanValue,
      aiValueText: input.aiValueText ?? "",
      humanValueText: input.humanValueText ?? "",
      variancePct,
      rootCause: input.rootCause.trim(),
      context: JSON.stringify(input.context ?? {}),
      correctedBy: actor.name,
    },
  });

  await prisma.platExecutionLog
    .create({
      data: {
        orgId: ctx.orgId,
        jobId: input.jobId,
        actorType: actor.type,
        actorName: actor.name,
        operation: "create",
        targetTable: "plat_core_correction",
        targetId: correction.id,
        payload: JSON.stringify({
          dimension: input.dimension,
          aiValue: input.aiValue,
          humanValue: input.humanValue,
          rootCause: input.rootCause,
        }),
        status: "executed",
        executedAt: new Date(),
        sourceMessageId: actor.sourceMessageId,
      },
    })
    .catch(() => {}); // audit failure must not lose the correction

  return correction.id;
}

/** Compare an AI-produced object against the human-edited version and return
 *  one CorrectionInput per changed numeric dimension — so every
 *  approve-with-edits flow emits corrections without bespoke code. */
export function diffForCorrections(
  aiObj: Record<string, unknown>,
  humanObj: Record<string, unknown>,
  dimensions: { field: string; dimension: string }[],
  base: Pick<CorrectionInput, "entityType" | "entityId" | "jobId" | "rootCause" | "context">,
): CorrectionInput[] {
  const out: CorrectionInput[] = [];
  for (const { field, dimension } of dimensions) {
    const ai = Number(aiObj[field]);
    const human = Number(humanObj[field]);
    if (!Number.isFinite(ai) || !Number.isFinite(human) || ai === human) continue;
    out.push({ ...base, dimension, aiValue: ai, humanValue: human });
  }
  return out;
}
