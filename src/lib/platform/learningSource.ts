// Learning Loop data source for the learning-rules page.
//
// Split by where each datum actually lives after the P2 migration:
//   • LEARNING_RULES — the durable, validated knowledge — read from Airtable
//     when AIRTABLE_MIGRATION is on (the engine writes/reads it there too, so
//     page and engine agree). The read here is the inverse of the learning_rule
//     field map (fieldMaps.ts) — no longer guesswork.
//   • HYPOTHESES / CORRECTIONS / INTELLIGENCE_SNAPSHOT — the loop machinery —
//     remain Postgres "engine state" (relational, numeric ids, and the
//     canonical Airtable schema lacks a Corrections→Hypotheses link to cluster
//     by), so they are read from Postgres in BOTH modes.

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

const RULE_ACTIVE_STATUSES = new Set(["Published", "Updated"]);

function parseGaps(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

async function rulesFromPostgres(ctx: OrgCtx): Promise<RuleView[]> {
  const rules = await prisma.platLearningRule.findMany({
    where: { orgId: ctx.orgId },
    orderBy: [{ isActive: "desc" }, { confidence: "desc" }],
  });
  return rules.map((r) => ({
    id: String(r.id),
    ruleCode: r.ruleCode,
    description: r.description,
    kind: r.kind,
    confidence: r.confidence,
    timesTriggered: r.timesTriggered,
    isActive: r.isActive,
    autoApply: r.autoApply,
    cannotOverride: r.cannotOverride,
  }));
}

async function rulesFromAirtable(ctx: OrgCtx): Promise<RuleView[]> {
  const rows = await core.list(ctx.orgSlug, "LEARNING_RULES", { maxRecords: 500 });
  return rows
    .map((r) => ({
      id: r.id,
      ruleCode: str(r["Instance"]),
      description: str(r["Rule_Description"]) || str(r["Rule_Name"]),
      kind: str(r["Rule_Type"]).toLowerCase() === "adjustment" ? "adjustment" : "guidance",
      confidence: num(r["Confidence_Level"]),
      timesTriggered: num(r["Times_Triggered"]),
      isActive: RULE_ACTIVE_STATUSES.has(str(r["Rule_Status"])),
      autoApply: str(r["Applies_To"]) === "AI Layer Only",
      cannotOverride: r["Override_Permission"] === false,
    }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.confidence - a.confidence);
}

/** Loop machinery — Postgres engine state in both modes. */
async function enginePartsFromPostgres(ctx: OrgCtx): Promise<Omit<LearningData, "rules">> {
  const [hypotheses, correctionsCount, unclustered, snapshots] = await Promise.all([
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
  return {
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

/** Load the learning-loop data: rules from the active backend, loop machinery
 *  always from Postgres. */
export async function loadLearning(ctx: OrgCtx): Promise<LearningData> {
  const [rules, engine] = await Promise.all([
    airtableEnabled() ? rulesFromAirtable(ctx) : rulesFromPostgres(ctx),
    enginePartsFromPostgres(ctx),
  ]);
  return { rules, ...engine };
}
