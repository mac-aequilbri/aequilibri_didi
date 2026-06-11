// Platform learning loop — org-scoped generalisation of the UC1 mechanism
// (src/services/uc1/learning.ts): CORRECTIONS → HYPOTHESES → LEARNING_RULES.
// Differences from UC1: every query is org-scoped; the trigger context is an
// open key/value JSON (UC1 hardcoded suburb/address); rules come in two kinds
// ("adjustment" = numeric, applied by the assessment engine; "guidance" =
// text, injected into the assistant prompt); thresholds live in PlatCfgSetting.

import { prisma } from "@/lib/db";
import { OrgCtx } from "@/lib/platform/types";

export interface Adjustment {
  type: "dimension_multiplier" | "contingency_pct";
  value: number;
  dimension?: string;
}

export interface LearningSettings {
  hypothesisMinSamples: number;
  ruleMinSamples: number;
  autoApplyConfidence: number;
  autoApplyTriggers: number;
}

const DEFAULTS: LearningSettings = {
  hypothesisMinSamples: 3,
  ruleMinSamples: 5,
  autoApplyConfidence: 85,
  autoApplyTriggers: 50,
};

const SETTING_KEYS: Record<keyof LearningSettings, string> = {
  hypothesisMinSamples: "learning.hypothesis_min_samples",
  ruleMinSamples: "learning.rule_min_samples",
  autoApplyConfidence: "learning.auto_apply_min_confidence",
  autoApplyTriggers: "learning.auto_apply_min_triggers",
};

export async function getLearningSettings(ctx: OrgCtx): Promise<LearningSettings> {
  const rows = await prisma.platCfgSetting.findMany({
    where: { orgId: ctx.orgId, key: { in: Object.values(SETTING_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULTS };
  for (const [field, key] of Object.entries(SETTING_KEYS) as [keyof LearningSettings, string][]) {
    const raw = byKey.get(key);
    if (raw == null) continue;
    const n = Number(JSON.parse(raw));
    if (Number.isFinite(n) && n > 0) out[field] = n;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();

function parseContext(raw: string): Record<string, string> {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// ── Hypothesis engine ───────────────────────────────────────────────
// Cluster the org's un-linked corrections by (dimension + normalised root
// cause); form or update a hypothesis once enough similar corrections exist.

export async function runHypothesisEngine(
  ctx: OrgCtx,
): Promise<{ created: number; updated: number }> {
  const settings = await getLearningSettings(ctx);
  const corrections = await prisma.platCorrection.findMany({
    where: { orgId: ctx.orgId, hypothesisId: null, rootCause: { not: "" } },
  });

  const groups = new Map<string, typeof corrections>();
  for (const c of corrections) {
    const key = `${c.dimension}::${norm(c.rootCause)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  let created = 0;
  let updated = 0;
  for (const [key, group] of groups) {
    if (group.length < settings.hypothesisMinSamples) continue;
    const [dimension, cause] = key.split("::");

    const variances = group.map((c) => c.variancePct).filter((v): v is number => v != null);
    const avgVar = variances.length
      ? Math.round((variances.reduce((s, v) => s + Math.abs(v), 0) / variances.length) * 10) / 10
      : 0;
    const signedAvg = variances.length
      ? variances.reduce((s, v) => s + v, 0) / variances.length
      : 0;

    // Trigger condition: context keys whose dominant value covers ≥60% of samples.
    const trigger: Record<string, string> = {};
    const keyCounts = new Map<string, Map<string, number>>();
    for (const c of group) {
      for (const [k, v] of Object.entries(parseContext(c.context))) {
        if (!v) continue;
        if (!keyCounts.has(k)) keyCounts.set(k, new Map());
        const m = keyCounts.get(k)!;
        m.set(norm(String(v)), (m.get(norm(String(v))) ?? 0) + 1);
      }
    }
    for (const [k, values] of keyCounts) {
      let best = "";
      let n = 0;
      for (const [v, count] of values) if (count > n) ((best = v), (n = count));
      if (n / group.length >= 0.6) trigger[k] = best;
    }

    const confidence = Math.min(95, group.length * 12);
    const direction = signedAvg >= 0 ? "under" : "over";
    const description =
      avgVar > 0
        ? `${dimension.replace(/[._]/g, " ")} ${direction}estimated by ~${avgVar}% on average — ${cause || "no root cause"}.`
        : `${dimension.replace(/[._]/g, " ")} repeatedly corrected — ${cause || "no root cause"}.`;

    const existing = await prisma.platHypothesis.findFirst({
      where: {
        orgId: ctx.orgId,
        dimension,
        rootCausePattern: cause,
        status: { in: ["pending", "active"] },
      },
    });

    let hypothesisId: number;
    if (existing) {
      const h = await prisma.platHypothesis.update({
        where: { id: existing.id },
        data: {
          description,
          sampleCount: group.length + existing.sampleCount,
          avgVariancePct: avgVar,
          confidence: Math.min(95, (group.length + existing.sampleCount) * 12),
          triggerCondition: JSON.stringify(trigger),
        },
      });
      hypothesisId = h.id;
      updated++;
    } else {
      const h = await prisma.platHypothesis.create({
        data: {
          orgId: ctx.orgId,
          description,
          dimension,
          rootCausePattern: cause,
          triggerCondition: JSON.stringify(trigger),
          sampleCount: group.length,
          avgVariancePct: avgVar,
          confidence,
          status: "pending",
        },
      });
      hypothesisId = h.id;
      created++;
    }
    await prisma.platCorrection.updateMany({
      where: { id: { in: group.map((c) => c.id) } },
      data: { hypothesisId },
    });
  }
  return { created, updated };
}

// ── Human gates ─────────────────────────────────────────────────────

export async function setHypothesisStatus(
  ctx: OrgCtx,
  id: number,
  status: "active" | "rejected",
): Promise<void> {
  await prisma.platHypothesis.updateMany({
    where: { id, orgId: ctx.orgId },
    data: { status, reviewedAt: new Date() },
  });
}

/** Allocate the next LRN-#### code for this org (transactional). */
export async function nextRuleCode(orgId: number): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const last = await tx.platLearningRule.findFirst({
      where: { orgId },
      orderBy: { id: "desc" },
      select: { ruleCode: true },
    });
    const lastNum = last ? Number(last.ruleCode.replace(/\D/g, "")) || 0 : 0;
    const count = await tx.platLearningRule.count({ where: { orgId } });
    return `LRN-${String(Math.max(lastNum, count) + 1).padStart(4, "0")}`;
  });
}

export async function promoteHypothesisToRule(
  ctx: OrgCtx,
  id: number,
  kind: "adjustment" | "guidance" = "adjustment",
): Promise<number | null> {
  const h = await prisma.platHypothesis.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!h) return null;

  const ruleCode = await nextRuleCode(ctx.orgId);
  const effectiveKind = h.avgVariancePct !== 0 && kind === "adjustment" ? "adjustment" : "guidance";

  let adjustment = "{}";
  if (effectiveKind === "adjustment") {
    const corrections = await prisma.platCorrection.findMany({
      where: { hypothesisId: h.id, variancePct: { not: null } },
      select: { variancePct: true },
    });
    const signed = corrections.length
      ? corrections.reduce((s, c) => s + (c.variancePct ?? 0), 0) / corrections.length
      : h.avgVariancePct;
    const mult = Math.round((1 + signed / 100) * 1000) / 1000;
    const adj: Adjustment =
      h.dimension === "contingency"
        ? { type: "contingency_pct", value: Math.abs(h.avgVariancePct) }
        : { type: "dimension_multiplier", value: mult, dimension: h.dimension };
    adjustment = JSON.stringify(adj);
  }

  const rule = await prisma.platLearningRule.create({
    data: {
      orgId: ctx.orgId,
      ruleCode,
      kind: effectiveKind,
      description: h.description,
      dimension: h.dimension,
      triggerCondition: h.triggerCondition,
      adjustment,
      priority: 3,
      confidence: Math.max(72, h.confidence),
      isActive: true,
      autoApply: false,
      sourceHypothesisId: h.id,
      dateActivated: new Date(),
    },
  });
  await prisma.platHypothesis.update({ where: { id: h.id }, data: { status: "promoted" } });
  return rule.id;
}

// ── Application ─────────────────────────────────────────────────────

function ruleMatches(triggerRaw: string, context: Record<string, string>): boolean {
  const trigger = parseContext(triggerRaw);
  for (const [k, v] of Object.entries(trigger)) {
    if (!v) continue;
    const have = norm(String(context[k] ?? ""));
    if (!have.includes(norm(String(v)))) return false;
  }
  return true; // empty trigger matches everything
}

export async function getActiveRules(ctx: OrgCtx) {
  return prisma.platLearningRule.findMany({
    where: { orgId: ctx.orgId, isActive: true },
    orderBy: [{ priority: "asc" }, { confidence: "desc" }],
  });
}

export interface AppliedRule {
  ruleCode: string;
  description: string;
  kind: string;
  adjustment: Adjustment | null;
  confidence: number;
  autoApply: boolean;
}

/** Match active rules against a context, log the firings, compound confidence. */
export async function applyRules(
  ctx: OrgCtx,
  context: Record<string, string>,
): Promise<AppliedRule[]> {
  const settings = await getLearningSettings(ctx);
  const rules = await getActiveRules(ctx);
  const applied: AppliedRule[] = [];
  for (const r of rules) {
    if (!ruleMatches(r.triggerCondition, context)) continue;
    let adjustment: Adjustment | null = null;
    if (r.kind === "adjustment") {
      try {
        adjustment = JSON.parse(r.adjustment) as Adjustment;
      } catch {
        adjustment = null;
      }
      if (!adjustment?.type) continue;
    }
    applied.push({
      ruleCode: r.ruleCode,
      description: r.description,
      kind: r.kind,
      adjustment,
      confidence: r.confidence,
      autoApply: r.autoApply,
    });
    await prisma.platLearningRule.update({
      where: { id: r.id },
      data: {
        timesTriggered: { increment: 1 },
        confidence: Math.min(99, r.confidence + 1),
        autoApply:
          r.confidence + 1 >= settings.autoApplyConfidence &&
          r.timesTriggered + 1 >= settings.autoApplyTriggers,
      },
    });
  }
  return applied;
}

/** Working-memory hydration: the org's rules as a prompt block for the assistant. */
export async function learningPromptText(ctx: OrgCtx): Promise<string> {
  const rules = await getActiveRules(ctx);
  if (!rules.length) return "";
  const locked = rules.filter((r) => r.cannotOverride);
  const rest = rules.filter((r) => !r.cannotOverride).slice(0, 12);
  const fmt = (r: (typeof rules)[number]) =>
    `- [${r.ruleCode} · conf ${r.confidence}] ${r.description}`;
  const parts: string[] = [];
  if (locked.length) {
    parts.push(`CRITICAL RULES (must never be overridden):\n${locked.map(fmt).join("\n")}`);
  }
  if (rest.length) {
    parts.push(
      `Validated learning rules for this customer (apply where relevant):\n${rest.map(fmt).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

// ── Contextual Intelligence snapshot ────────────────────────────────

export async function snapshotIntelligence(ctx: OrgCtx): Promise<number> {
  const [totalJobs, completedJobs, rules, corrections, pendingHyp, prevSnap] = await Promise.all([
    prisma.platJob.count({ where: { orgId: ctx.orgId } }),
    prisma.platJob.count({ where: { orgId: ctx.orgId, status: { in: ["completed", "archived"] } } }),
    prisma.platLearningRule.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      orderBy: { confidence: "desc" },
    }),
    prisma.platCorrection.findMany({
      where: { orgId: ctx.orgId, variancePct: { not: null } },
      select: { variancePct: true },
    }),
    prisma.platHypothesis.count({ where: { orgId: ctx.orgId, status: "pending" } }),
    prisma.platIntelligenceSnapshot.findFirst({
      where: { orgId: ctx.orgId },
      orderBy: { capturedAt: "desc" },
    }),
  ]);

  const accuracy = corrections.length
    ? Math.round(
        (100 -
          corrections.reduce((s, c) => s + Math.abs(c.variancePct ?? 0), 0) / corrections.length) *
          10,
      ) / 10
    : null;
  const avgConfidence = rules.length
    ? Math.round((rules.reduce((s, r) => s + r.confidence, 0) / rules.length) * 10) / 10
    : 0;
  const autoApplyRules = rules.filter((r) => r.autoApply).length;

  const gaps: string[] = [];
  if (corrections.length === 0) gaps.push("No corrections recorded — the learning loop has no episodic input yet.");
  if (pendingHyp > 0) gaps.push(`${pendingHyp} hypotheses awaiting human review.`);
  if (!rules.length) gaps.push("No active learning rules yet — corrections not yet promoted.");
  if (autoApplyRules === 0 && rules.length > 0) gaps.push("No rules at auto-apply threshold yet.");

  let trajectory = "stable";
  if (prevSnap) {
    const delta = avgConfidence - prevSnap.avgConfidence;
    if (delta > 2) trajectory = "improving";
    else if (delta < -2) trajectory = "degrading";
  }

  const snap = await prisma.platIntelligenceSnapshot.create({
    data: {
      orgId: ctx.orgId,
      totalJobs,
      completedJobs,
      accuracyRatePct: accuracy,
      activeRules: rules.length,
      autoApplyRules,
      avgConfidence,
      topRules: JSON.stringify(
        rules.slice(0, 5).map((r) => ({
          code: r.ruleCode,
          confidence: r.confidence,
          triggers: r.timesTriggered,
          desc: r.description,
        })),
      ),
      gaps: JSON.stringify(gaps),
      metrics: JSON.stringify({ trajectory, corrections: corrections.length }),
    },
  });
  return snap.id;
}
