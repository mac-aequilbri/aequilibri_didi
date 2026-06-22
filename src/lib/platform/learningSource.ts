// Learning Loop data source — Postgres (default) or the canonical Airtable
// tables (LEARNING_RULES / HYPOTHESES / CORRECTIONS / INTELLIGENCE_SNAPSHOT)
// when AIRTABLE_MIGRATION is enabled.
//
// ⚠️ ASSUMPTION MAPPINGS — Airtable's learning-loop topology differs from the
// app's, so the Airtable branch encodes best-guess mappings that MUST be
// confirmed (see docs/airtable-migration-mapping.md §8/§11). Each is flagged
// inline with ASSUMPTION. These are deliberately explicit guesses, not a
// reconciliation.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import type { OrgCtx } from "./types";

export interface RuleView {
  id: string;
  ruleCode: string;
  description: string;
  kind: string;
  confidence: number;
  timesTriggered: number;
  isActive: boolean;
  autoApply: boolean;
  cannotOverride: boolean;
}

export interface HypothesisView {
  id: string;
  description: string;
  dimension: string;
  sampleCount: number;
  avgVariancePct: number;
  confidence: number;
}

export interface SnapshotView {
  id: string;
  capturedAt: Date | null;
  accuracyRatePct: number | null;
  activeRules: number;
  autoApplyRules: number;
  avgConfidence: number;
  gaps: string[];
}

export interface LearningData {
  rules: RuleView[];
  hypotheses: HypothesisView[];
  correctionsCount: number;
  unclustered: number;
  snapshots: SnapshotView[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function bool(v: unknown): boolean {
  return v === true;
}

async function fromPostgres(ctx: OrgCtx): Promise<LearningData> {
  const [rules, hypotheses, correctionsCount, unclustered, snapshots] = await Promise.all([
    prisma.platLearningRule.findMany({
      where: { orgId: ctx.orgId },
      orderBy: [{ isActive: "desc" }, { confidence: "desc" }],
    }),
    prisma.platHypothesis.findMany({
      where: { orgId: ctx.orgId, status: "pending" },
      orderBy: { confidence: "desc" },
    }),
    prisma.platCorrection.count({ where: { orgId: ctx.orgId } }),
    prisma.platCorrection.count({ where: { orgId: ctx.orgId, hypothesisId: null } }),
    prisma.platIntelligenceSnapshot.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { capturedAt: "desc" },
      take: 24,
    }),
  ]);
  const parseGaps = (raw: string): string[] => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  };
  return {
    rules: rules.map((r) => ({
      id: String(r.id),
      ruleCode: r.ruleCode,
      description: r.description,
      kind: r.kind,
      confidence: r.confidence,
      timesTriggered: r.timesTriggered,
      isActive: r.isActive,
      autoApply: r.autoApply,
      cannotOverride: r.cannotOverride,
    })),
    hypotheses: hypotheses.map((h) => ({
      id: String(h.id),
      description: h.description,
      dimension: h.dimension,
      sampleCount: h.sampleCount,
      avgVariancePct: h.avgVariancePct,
      confidence: h.confidence,
    })),
    correctionsCount,
    unclustered,
    snapshots: snapshots.map((s) => ({
      id: String(s.id),
      capturedAt: s.capturedAt,
      accuracyRatePct: s.accuracyRatePct,
      activeRules: s.activeRules,
      autoApplyRules: s.autoApplyRules,
      avgConfidence: s.avgConfidence,
      gaps: parseGaps(s.gaps),
    })),
  };
}

async function fromAirtable(ctx: OrgCtx): Promise<LearningData> {
  const [ruleRows, hypRows, corrRows, snapRows] = await Promise.all([
    core.list(ctx.orgSlug, "LEARNING_RULES", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "HYPOTHESES", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "CORRECTIONS", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "INTELLIGENCE_SNAPSHOT", { maxRecords: 24 }),
  ]);

  const rules: RuleView[] = ruleRows.map((r) => ({
    id: r.id,
    ruleCode: str(r["Instance"]), // ASSUMPTION: Instance ~= rule code
    description: str(r["Rule_Description"]) || str(r["Rule_Name"]),
    kind: str(r["Rule_Type"]),
    confidence: num(r["Confidence_Level"]),
    timesTriggered: num(r["Times_Triggered"]),
    // ASSUMPTION: Published/Updated => active; Draft/Retired => inactive
    isActive: ["Published", "Updated"].includes(str(r["Rule_Status"])),
    // ASSUMPTION: applies only to the AI layer => auto-apply
    autoApply: str(r["Applies_To"]) === "AI Layer Only",
    // ASSUMPTION: no override permission => locked
    cannotOverride: bool(r["Override_Permission"]) === false,
  }));

  // ASSUMPTION: "pending review" == Airtable status "Open"
  const hypotheses: HypothesisView[] = hypRows
    .filter((h) => str(h["Status"]) === "Open")
    .map((h) => ({
      id: h.id,
      description: str(h["Hypothesis_Name"]),
      dimension: str(h["Hypothesis_Type"]), // ASSUMPTION: type stands in for dimension
      sampleCount: num(h["Evidence_Count"]),
      avgVariancePct: 0, // no Airtable equivalent
      confidence: num(h["Confidence"]),
    }));

  const correctionsCount = corrRows.length;
  // ASSUMPTION: "unclustered" == not yet turned into a rule (Rule_Generated unchecked)
  const unclustered = corrRows.filter((c) => bool(c["Rule_Generated"]) === false).length;

  const snapshots: SnapshotView[] = snapRows.map((s) => {
    const when = str(s["Snapshot_Date"]) || str(s["Date_Created"]);
    const gapsText = str(s["Known_Gaps"]);
    return {
      id: s.id,
      capturedAt: when ? new Date(when) : null,
      accuracyRatePct: null, // no accuracy field in Airtable snapshot
      activeRules: num(s["Total_Active_Rules"]),
      autoApplyRules: 0, // no Airtable equivalent
      avgConfidence: 0, // no Airtable equivalent (kept for the trend chart shape)
      gaps: gapsText ? [gapsText] : [],
    };
  });

  return { rules, hypotheses, correctionsCount, unclustered, snapshots };
}

/** Load the learning-loop data from whichever backend is active. */
export function loadLearning(ctx: OrgCtx): Promise<LearningData> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
