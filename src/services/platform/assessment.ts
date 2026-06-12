// Assessment Engine (module 3) — the invariant pattern from the doc:
// intake → source cascade → AI analysis → LEARNING_RULES application →
// structured output with per-field confidence and flagged assumptions.
// Domain-agnostic: the construction vertical (and future verticals) supply
// the field definitions and source providers.

import { calcConfidence, combine } from "@/lib/platform/confidence";
import { CascadeOutcome, resolveField, SourceProvider } from "@/lib/platform/sourceCascade";
import { OrgCtx } from "@/lib/platform/types";
import { Adjustment, applyRules, AppliedRule } from "./learning";

export interface AssessmentField<T = number | string> {
  key: string;
  /** Learning-loop dimension this field maps to (for rule application). */
  dimension: string;
  providers: SourceProvider<T>[];
}

export interface AssessmentIntake {
  jobId?: number;
  /** Trigger context for rule matching, e.g. { suburb: "Dulong" }. */
  context: Record<string, string>;
  fields: AssessmentField[];
}

export interface AssessedField {
  value: number | string | null;
  confidence: number;
  source: string;
  adjustedBy: string[];
  assumptions: string[];
}

export interface AssessmentResult {
  fields: Record<string, AssessedField>;
  appliedRules: AppliedRule[];
  overallConfidence: number;
}

function applyAdjustment(value: number, adj: Adjustment): number {
  switch (adj.type) {
    case "dimension_multiplier":
      return Math.round(value * adj.value * 100) / 100;
    case "contingency_pct":
      return Math.round(value * (1 + adj.value / 100) * 100) / 100;
    default:
      return value;
  }
}

export async function runAssessment(
  ctx: OrgCtx,
  intake: AssessmentIntake,
): Promise<AssessmentResult> {
  const appliedRules = await applyRules(ctx, intake.context);

  const fields: Record<string, AssessedField> = {};
  for (const field of intake.fields) {
    const outcome: CascadeOutcome<number | string> = await resolveField(field.providers);
    const assumptions: string[] = [];
    const adjustedBy: string[] = [];
    let value = outcome.value;
    let confidence = outcome.confidence;

    if (value == null) {
      assumptions.push(`No source returned ${field.key} — value missing.`);
    } else if (typeof value === "number") {
      // Auto-apply qualified adjustment rules for this field's dimension.
      for (const rule of appliedRules) {
        if (rule.kind !== "adjustment" || !rule.adjustment) continue;
        if (rule.adjustment.dimension && rule.adjustment.dimension !== field.dimension) continue;
        if (!rule.autoApply) {
          assumptions.push(
            `Rule ${rule.ruleCode} matched but is below the auto-apply threshold — review suggested adjustment.`,
          );
          continue;
        }
        value = applyAdjustment(value, rule.adjustment);
        confidence = combine(confidence, rule.confidence);
        adjustedBy.push(rule.ruleCode);
      }
    }

    fields[field.key] = {
      value,
      confidence,
      source: outcome.source,
      adjustedBy,
      assumptions,
    };
  }

  const overallConfidence = calcConfidence(
    Object.values(fields).map((f) => ({ source: f.source, weight: 1, score: f.confidence })),
  );
  return { fields, appliedRules, overallConfidence };
}
