// UC1 learning loop — the correction→hypothesis→rule mechanism from the
// aequilibri Memory Architecture. Episodic (Job/Correction) → Semantic
// (Hypothesis→LearningRule) → Contextual Intelligence (snapshot + applied rules).

import { prisma } from "@/lib/db";

const HYPOTHESIS_MIN_SAMPLES = 3; // corrections needed to form a hypothesis
const RULE_MIN_SAMPLES = 5; // samples before a hypothesis can be promoted
const AUTO_APPLY_CONFIDENCE = 85;
const AUTO_APPLY_TRIGGERS = 50;

export interface Adjustment {
  type: "area_multiplier" | "dimension_multiplier" | "contingency_pct";
  value: number;
  dimension?: string;
}

function variancePct(ai: number, human: number): number {
  if (!ai) return human ? 100 : 0;
  return Math.round(((human - ai) / ai) * 1000) / 10;
}

function normCause(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
}

// ── Capture (episodic) ──────────────────────────────────────────────
export async function recordCorrection(input: {
  quoteId?: number; address?: string; suburb?: string; lat?: number | null; lng?: number | null;
  dimension: string; aiValue: number; humanValue: number; rootCause?: string;
}): Promise<number> {
  const row = await prisma.uc1Correction.create({
    data: {
      quoteId: input.quoteId ?? null,
      address: input.address ?? "",
      suburb: input.suburb ?? "",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      dimension: input.dimension,
      aiValue: input.aiValue,
      humanValue: input.humanValue,
      variancePct: variancePct(input.aiValue, input.humanValue),
      rootCause: input.rootCause ?? "",
    },
  });
  return row.id;
}

// ── Hypothesis engine ───────────────────────────────────────────────
// Cluster un-linked corrections by (dimension + normalised root cause) and
// form/update a Hypothesis once enough similar corrections accumulate.
export async function runHypothesisEngine(): Promise<{ created: number; updated: number }> {
  const corrections = await prisma.uc1Correction.findMany({ where: { hypothesisId: null } });
  const groups = new Map<string, typeof corrections>();
  for (const c of corrections) {
    const key = `${c.dimension}::${normCause(c.rootCause)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  let created = 0, updated = 0;
  for (const [key, group] of groups) {
    if (group.length < HYPOTHESIS_MIN_SAMPLES) continue;
    const [dimension, cause] = key.split("::");
    const avgVar = Math.round((group.reduce((s, c) => s + Math.abs(c.variancePct), 0) / group.length) * 10) / 10;
    const suburbs = group.map((c) => c.suburb).filter(Boolean);
    const domSuburb = mode(suburbs);
    const trigger = domSuburb ? `suburb:${normCause(domSuburb)}` : "all";
    const confidence = Math.min(95, group.length * 12);

    // Merge into an existing open hypothesis for the same dimension+cause if present.
    const existing = await prisma.uc1Hypothesis.findFirst({
      where: { dimension, rootCausePattern: cause, status: { in: ["pending", "active"] } },
    });
    const desc = `${dimension.replace(/_/g, " ")} ${avgVar >= 0 ? "under" : "over"}counted (~${Math.abs(avgVar)}% avg) on ${domSuburb || "various"} properties — ${cause || "no root cause"}.`;
    let hypId: number;
    if (existing) {
      const h = await prisma.uc1Hypothesis.update({
        where: { id: existing.id },
        data: { description: desc, sampleCount: group.length, avgVariancePct: avgVar, confidence, triggerCondition: trigger, promoteToRule: confidence >= 70 && group.length >= RULE_MIN_SAMPLES },
      });
      hypId = h.id; updated++;
    } else {
      const h = await prisma.uc1Hypothesis.create({
        data: { description: desc, dimension, rootCausePattern: cause, triggerCondition: trigger, sampleCount: group.length, avgVariancePct: avgVar, confidence, status: "pending", promoteToRule: confidence >= 70 && group.length >= RULE_MIN_SAMPLES },
      });
      hypId = h.id; created++;
    }
    await prisma.uc1Correction.updateMany({ where: { id: { in: group.map((c) => c.id) } }, data: { hypothesisId: hypId } });
  }
  return { created, updated };
}

function mode(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const a of arr) counts.set(a, (counts.get(a) ?? 0) + 1);
  let best = "", n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

// ── Human gates ─────────────────────────────────────────────────────
export async function setHypothesisStatus(id: number, status: "active" | "rejected") {
  await prisma.uc1Hypothesis.update({ where: { id }, data: { status, reviewedAt: new Date() } });
}

export async function promoteHypothesisToRule(id: number): Promise<number | null> {
  const h = await prisma.uc1Hypothesis.findUnique({ where: { id } });
  if (!h) return null;
  const count = await prisma.uc1LearningRule.count();
  const ruleCode = `LRN-${String(count + 1).padStart(4, "0")}`;
  // Default adjustment: scale the dimension by the average variance.
  const mult = 1 + h.avgVariancePct / 100;
  const adjustment: Adjustment =
    h.dimension === "roof_area" ? { type: "area_multiplier", value: Math.round(mult * 1000) / 1000 }
    : h.dimension === "contingency" ? { type: "contingency_pct", value: Math.abs(h.avgVariancePct) }
    : { type: "dimension_multiplier", value: Math.round(mult * 1000) / 1000, dimension: h.dimension };

  const rule = await prisma.uc1LearningRule.create({
    data: {
      ruleCode, description: h.description, dimension: h.dimension, triggerCondition: h.triggerCondition,
      adjustment: JSON.stringify(adjustment), priority: 3, confidence: Math.max(72, h.confidence), timesTriggered: 0,
      isActive: true, autoApply: false, sourceId: h.id,
    },
  });
  await prisma.uc1Hypothesis.update({ where: { id }, data: { status: "promoted" } });
  return rule.id;
}

// ── Application (the payoff) ─────────────────────────────────────────
interface RuleContext { suburb?: string; address?: string }

function ruleMatches(trigger: string, ctx: RuleContext): boolean {
  if (!trigger || trigger === "all") return true;
  const hay = `${normCause(ctx.suburb ?? "")} ${normCause(ctx.address ?? "")}`;
  for (const part of trigger.split(";")) {
    const [k, v] = part.split(":");
    if (k === "suburb" && v && !hay.includes(v)) return false;
  }
  return true;
}

export async function getActiveRules() {
  return prisma.uc1LearningRule.findMany({ where: { isActive: true }, orderBy: [{ priority: "asc" }, { confidence: "desc" }] });
}

/** Returns the rules that apply to a context + their parsed adjustments, and logs firings. */
export async function applyRules(ctx: RuleContext): Promise<{ ruleCode: string; description: string; adjustment: Adjustment; confidence: number }[]> {
  const rules = await getActiveRules();
  const applied: { ruleCode: string; description: string; adjustment: Adjustment; confidence: number }[] = [];
  for (const r of rules) {
    if (!ruleMatches(r.triggerCondition, ctx)) continue;
    let adj: Adjustment;
    try { adj = JSON.parse(r.adjustment); } catch { continue; }
    applied.push({ ruleCode: r.ruleCode, description: r.description, adjustment: adj, confidence: r.confidence });
    await prisma.uc1LearningRule.update({
      where: { id: r.id },
      data: { timesTriggered: { increment: 1 }, confidence: Math.min(99, r.confidence + 1), autoApply: r.confidence + 1 >= AUTO_APPLY_CONFIDENCE && r.timesTriggered + 1 >= AUTO_APPLY_TRIGGERS },
    });
  }
  return applied;
}

/** Working-memory hydration: rules as a prompt block for Claude. */
export async function learningPromptText(): Promise<string> {
  const rules = await getActiveRules();
  if (!rules.length) return "";
  const lines = rules.slice(0, 12).map((r) => `- [${r.ruleCode} · conf ${r.confidence}] ${r.description}`);
  return `Validated learning rules for this customer (apply where relevant):\n${lines.join("\n")}`;
}

// ── Contextual Intelligence snapshot ────────────────────────────────
export async function snapshotIntelligence(): Promise<number> {
  const [totalJobs, completed, rules, prevSnap] = await Promise.all([
    prisma.uc1Job.count(),
    prisma.uc1Job.findMany({ where: { status: { in: ["completed", "invoiced"] }, variancePctArea: { not: null } }, select: { variancePctArea: true } }),
    prisma.uc1LearningRule.findMany({ where: { isActive: true }, orderBy: { confidence: "desc" } }),
    prisma.uc1IntelligenceSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
  ]);
  const accuracy = completed.length
    ? Math.round((100 - completed.reduce((s, j) => s + Math.abs(j.variancePctArea ?? 0), 0) / completed.length) * 10) / 10
    : 0;
  const avgConf = rules.length ? Math.round((rules.reduce((s, r) => s + r.confidence, 0) / rules.length) * 10) / 10 : 0;
  const autoApplyRules = rules.filter((r) => r.autoApply).length;

  // Trajectory: compare avg confidence to previous snapshot.
  let confidenceTrajectory: "improving" | "stable" | "degrading" = "stable";
  if (prevSnap) {
    const delta = avgConf - prevSnap.avgConfidence;
    if (delta > 2) confidenceTrajectory = "improving";
    else if (delta < -2) confidenceTrajectory = "degrading";
  }

  const pendingHyp = await prisma.uc1Hypothesis.count({ where: { status: "pending" } });
  const gaps: string[] = [];
  if (totalJobs === 0) gaps.push("No JOBS recorded — learning loop has no episodic input yet.");
  if (pendingHyp > 0) gaps.push(`${pendingHyp} hypotheses awaiting human review.`);
  if (!rules.length) gaps.push("No active LEARNING_RULES yet — corrections not yet promoted.");
  if (autoApplyRules === 0 && rules.length > 0) gaps.push("No rules at Auto_Apply threshold yet (need conf > 85 AND 50+ triggers).");

  const snap = await prisma.uc1IntelligenceSnapshot.create({
    data: {
      totalJobs, completedJobs: completed.length, accuracyRatePct: accuracy,
      activeRules: rules.length, autoApplyRules, avgConfidence: avgConf,
      confidenceTrajectory,
      topRulesJson: JSON.stringify(rules.slice(0, 5).map((r) => ({ code: r.ruleCode, confidence: r.confidence, triggers: r.timesTriggered, desc: r.description }))),
      gapsJson: JSON.stringify(gaps),
    },
  });
  return snap.id;
}
