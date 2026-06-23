// Platform learning loop — org-scoped generalisation of the UC1 mechanism
// (src/services/uc1/learning.ts): CORRECTIONS → HYPOTHESES → LEARNING_RULES.
// Differences from UC1: every query is org-scoped; the trigger context is an
// open key/value JSON (UC1 hardcoded suburb/address); rules come in two kinds
// ("adjustment" = numeric, applied by the assessment engine; "guidance" =
// text, injected into the assistant prompt); thresholds live in PlatCfgSetting.

import { airtableEnabled, core } from "@/lib/airtable";
import { airtableMapFor, toFields } from "@/lib/airtable/fieldMaps";
import { prisma } from "@/lib/db";
import type { RecordId } from "@/lib/platform/recordWriter";
import { OrgCtx } from "@/lib/platform/types";

const S = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const N = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

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

async function settingsByKey(ctx: OrgCtx): Promise<Map<string, string>> {
  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "PLAT_CFG_SETTING", { maxRecords: 500 });
    const m = new Map<string, string>();
    for (const r of rows) {
      const key = typeof r["Setting_Key"] === "string" ? (r["Setting_Key"] as string) : "";
      if (key) m.set(key, typeof r["Value"] === "string" ? (r["Value"] as string) : String(r["Value"] ?? ""));
    }
    return m;
  }
  const rows = await prisma.platCfgSetting.findMany({
    where: { orgId: ctx.orgId, key: { in: Object.values(SETTING_KEYS) } },
  });
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function getLearningSettings(ctx: OrgCtx): Promise<LearningSettings> {
  const byKey = await settingsByKey(ctx);
  const out = { ...DEFAULTS };
  for (const [field, key] of Object.entries(SETTING_KEYS) as [keyof LearningSettings, string][]) {
    const raw = byKey.get(key);
    if (raw == null) continue;
    // Settings are stored as a JSON-encoded scalar in Postgres; the Airtable
    // mirror stores the plain value. Parse defensively for both.
    let n = Number(raw);
    if (!Number.isFinite(n)) {
      try {
        n = Number(JSON.parse(raw));
      } catch {
        continue;
      }
    }
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

// ── Airtable corrections/hypotheses (the loop machinery, mirrored into the
// base once scripts/airtable-add-hypothesis-link.mjs has added the link) ──────

const HYP_OPEN_STATUSES = new Set(["pending", "active"]);

interface AirCorrection {
  id: string;
  dimension: string;
  rootCause: string;
  variancePct: number | null;
  context: Record<string, string>;
  clustered: boolean;
}
function airCorrection(r: Record<string, unknown> & { id: string }): AirCorrection {
  let context: Record<string, string> = {};
  try {
    const n = JSON.parse(S(r["Notes"]) || "{}") as { context?: unknown };
    if (n && typeof n.context === "object" && n.context) context = n.context as Record<string, string>;
  } catch {
    /* malformed Notes */
  }
  const v = r["Variance_Percent"];
  return {
    id: r.id,
    dimension: S(r["Field_Corrected"]),
    rootCause: S(r["Root_Cause"]),
    variancePct: typeof v === "number" ? v : null,
    context,
    clustered: Array.isArray(r["Hypothesis"]) && (r["Hypothesis"] as unknown[]).length > 0,
  };
}

interface AirHypothesis {
  id: string;
  description: string;
  dimension: string;
  rootCausePattern: string;
  triggerCondition: string;
  sampleCount: number;
  avgVariancePct: number;
  confidence: number;
  status: string;
}
function airHypothesis(r: Record<string, unknown> & { id: string }): AirHypothesis {
  let meta: Record<string, unknown> = {};
  try {
    meta = (JSON.parse(S(r["Evidence"]) || "{}") as Record<string, unknown>) || {};
  } catch {
    /* malformed Evidence */
  }
  return {
    id: r.id,
    description: S(r["Summary_of_Findings"]) || S(r["Hypothesis_Name"]),
    dimension: S(meta.dimension),
    rootCausePattern: S(meta.rootCausePattern),
    triggerCondition: S(meta.triggerCondition) || "{}",
    sampleCount: N(r["Evidence_Count"]),
    avgVariancePct: N(meta.avgVariancePct),
    confidence: N(r["Confidence"]),
    status: S(r["Status"]) || "pending",
  };
}
function hypFields(h: Omit<AirHypothesis, "id">): Record<string, unknown> {
  return {
    Hypothesis_Name: h.description.slice(0, 120) || "Hypothesis",
    Summary_of_Findings: h.description,
    Status: h.status,
    Evidence_Count: h.sampleCount,
    Confidence: h.confidence,
    Evidence: JSON.stringify({
      dimension: h.dimension,
      rootCausePattern: h.rootCausePattern,
      avgVariancePct: h.avgVariancePct,
      triggerCondition: h.triggerCondition,
    }),
  };
}

/** Airtable port of the clustering engine. Same statistics as the Postgres
 *  path; persistence via core.* (no transaction — corrections are low-volume). */
async function runHypothesisEngineAirtable(
  ctx: OrgCtx,
  settings: LearningSettings,
): Promise<{ created: number; updated: number }> {
  const [corrRows, hypRows] = await Promise.all([
    core.list(ctx.orgSlug, "CORRECTIONS", { maxRecords: 1000 }),
    core.list(ctx.orgSlug, "HYPOTHESES", { maxRecords: 500 }),
  ]);
  const corrections = corrRows.map(airCorrection).filter((c) => !c.clustered && c.rootCause);
  const existing = hypRows.map(airHypothesis);

  const groups = new Map<string, AirCorrection[]>();
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
    const signedAvg = variances.length ? variances.reduce((s, v) => s + v, 0) / variances.length : 0;

    const trigger: Record<string, string> = {};
    const keyCounts = new Map<string, Map<string, number>>();
    for (const c of group) {
      for (const [k, v] of Object.entries(c.context)) {
        if (!v) continue;
        if (!keyCounts.has(k)) keyCounts.set(k, new Map());
        const m = keyCounts.get(k)!;
        m.set(norm(String(v)), (m.get(norm(String(v))) ?? 0) + 1);
      }
    }
    for (const [k, values] of keyCounts) {
      let best = "";
      let n = 0;
      for (const [v, count] of values) if (count > n) { best = v; n = count; }
      if (n / group.length >= 0.6) trigger[k] = best;
    }

    const direction = signedAvg >= 0 ? "under" : "over";
    const description =
      avgVar > 0
        ? `${dimension.replace(/[._]/g, " ")} ${direction}estimated by ~${avgVar}% on average — ${cause || "no root cause"}.`
        : `${dimension.replace(/[._]/g, " ")} repeatedly corrected — ${cause || "no root cause"}.`;

    const prior = existing.find(
      (h) => h.dimension === dimension && h.rootCausePattern === cause && HYP_OPEN_STATUSES.has(h.status),
    );

    let hypId: string;
    if (prior) {
      const sampleCount = group.length + prior.sampleCount;
      await core.update(
        ctx.orgSlug,
        "HYPOTHESES",
        prior.id,
        hypFields({
          description,
          dimension,
          rootCausePattern: cause,
          triggerCondition: JSON.stringify(trigger),
          sampleCount,
          avgVariancePct: avgVar,
          confidence: Math.min(95, sampleCount * 12),
          status: prior.status,
        }),
      );
      hypId = prior.id;
      updated++;
    } else {
      const rec = await core.create(
        ctx.orgSlug,
        "HYPOTHESES",
        hypFields({
          description,
          dimension,
          rootCausePattern: cause,
          triggerCondition: JSON.stringify(trigger),
          sampleCount: group.length,
          avgVariancePct: avgVar,
          confidence: Math.min(95, group.length * 12),
          status: "pending",
        }),
      );
      hypId = rec.id;
      created++;
    }
    for (const c of group) {
      await core.update(ctx.orgSlug, "CORRECTIONS", c.id, { Hypothesis: [hypId] });
    }
  }
  return { created, updated };
}

// ── Hypothesis engine ───────────────────────────────────────────────
// Cluster the org's un-linked corrections by (dimension + normalised root
// cause); form or update a hypothesis once enough similar corrections exist.

export async function runHypothesisEngine(
  ctx: OrgCtx,
): Promise<{ created: number; updated: number }> {
  const settings = await getLearningSettings(ctx);
  if (airtableEnabled()) return runHypothesisEngineAirtable(ctx, settings);
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
      for (const [v, count] of values) if (count > n) { best = v; n = count; }
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
      where: { orgId: ctx.orgId, id: { in: group.map((c) => c.id) } },
      data: { hypothesisId },
    });
  }
  return { created, updated };
}

// ── Human gates ─────────────────────────────────────────────────────

export async function setHypothesisStatus(
  ctx: OrgCtx,
  id: RecordId,
  status: "active" | "rejected",
): Promise<void> {
  if (airtableEnabled()) {
    await core.update(ctx.orgSlug, "HYPOTHESES", String(id), {
      Status: status,
      Date_Closed: status === "rejected" ? new Date().toISOString() : undefined,
    });
    return;
  }
  await prisma.platHypothesis.updateMany({
    where: { id: Number(id), orgId: ctx.orgId },
    data: { status, reviewedAt: new Date() },
  });
}

/** Next LRN-#### code for this org: max existing suffix + 1 (count-based
 *  numbering duplicates after deletions). Reads from whichever backend holds the
 *  rules. Concurrent allocations can still collide — the Postgres path retries
 *  under @@unique([orgId, ruleCode]); Airtable has no unique constraint (rare
 *  dup tolerated, matching the rest of the Airtable write path). */
export async function nextRuleCode(ctx: OrgCtx, bump = 0): Promise<string> {
  let max = 0;
  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "LEARNING_RULES", { maxRecords: 500 });
    max = rows.reduce((m, r) => Math.max(m, Number(S(r["Instance"]).replace(/\D/g, "")) || 0), 0);
  } else {
    const rules = await prisma.platLearningRule.findMany({
      where: { orgId: ctx.orgId },
      select: { ruleCode: true },
    });
    max = rules.reduce((m, r) => Math.max(m, Number(r.ruleCode.replace(/\D/g, "")) || 0), 0);
  }
  return `LRN-${String(max + 1 + bump).padStart(4, "0")}`;
}

/** App-shaped rule create payload (a subset of the Prisma create data, shared
 *  with the Airtable field map). */
type RuleCreateData = Omit<
  Parameters<typeof prisma.platLearningRule.create>[0]["data"],
  "ruleCode" | "orgId"
>;

/** Create a rule with a freshly allocated code. Routes to the org's Airtable
 *  base (via the learning_rule field map) or Postgres (retrying on a unique-code
 *  collision from two concurrent promotions). */
export async function createRuleWithCode(
  ctx: OrgCtx,
  data: RuleCreateData,
): Promise<{ id: string; ruleCode: string }> {
  if (airtableEnabled()) {
    const ruleCode = await nextRuleCode(ctx);
    const map = airtableMapFor("learning_rule")!;
    const rec = await core.create(
      ctx.orgSlug,
      map.table,
      toFields(map, { ...(data as Record<string, unknown>), ruleCode }, "create"),
    );
    return { id: rec.id, ruleCode };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const ruleCode = await nextRuleCode(ctx, attempt);
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const rule = await prisma.platLearningRule.create({ data: { ...(data as any), orgId: ctx.orgId, ruleCode } });
      return { id: String(rule.id), ruleCode };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002" || attempt === 2) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function promoteHypothesisToRule(
  ctx: OrgCtx,
  id: RecordId,
  kind: "adjustment" | "guidance" = "adjustment",
): Promise<string | null> {
  if (airtableEnabled()) {
    const rec = await core.get(ctx.orgSlug, "HYPOTHESES", String(id)).catch(() => null);
    if (!rec) return null;
    const h = airHypothesis(rec);
    const effectiveKind = h.avgVariancePct !== 0 && kind === "adjustment" ? "adjustment" : "guidance";
    let adjustment = "{}";
    if (effectiveKind === "adjustment") {
      const variances = (await core.list(ctx.orgSlug, "CORRECTIONS", { maxRecords: 1000 }))
        .filter(
          (c) =>
            Array.isArray(c["Hypothesis"]) &&
            (c["Hypothesis"] as unknown[]).map(String).includes(String(id)),
        )
        .map((c) => (typeof c["Variance_Percent"] === "number" ? (c["Variance_Percent"] as number) : null))
        .filter((v): v is number => v != null);
      const signed = variances.length
        ? variances.reduce((s, v) => s + v, 0) / variances.length
        : h.avgVariancePct;
      const mult = Math.round((1 + signed / 100) * 1000) / 1000;
      const adj: Adjustment =
        h.dimension === "contingency"
          ? { type: "contingency_pct", value: Math.abs(h.avgVariancePct) }
          : { type: "dimension_multiplier", value: mult, dimension: h.dimension };
      adjustment = JSON.stringify(adj);
    }
    const rule = await createRuleWithCode(ctx, {
      kind: effectiveKind,
      description: h.description,
      dimension: h.dimension,
      triggerCondition: h.triggerCondition,
      adjustment,
      priority: 3,
      confidence: Math.max(72, h.confidence),
      isActive: true,
      autoApply: false,
      dateActivated: new Date(),
    });
    await core.update(ctx.orgSlug, "HYPOTHESES", String(id), { Status: "promoted" });
    return rule.id;
  }

  const h = await prisma.platHypothesis.findFirst({ where: { id: Number(id), orgId: ctx.orgId } });
  if (!h) return null;

  const effectiveKind = h.avgVariancePct !== 0 && kind === "adjustment" ? "adjustment" : "guidance";

  let adjustment = "{}";
  if (effectiveKind === "adjustment") {
    const corrections = await prisma.platCorrection.findMany({
      where: { orgId: ctx.orgId, hypothesisId: h.id, variancePct: { not: null } },
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

  const rule = await createRuleWithCode(ctx, {
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

/** Backend-neutral active-rule shape consumed by the engine + assistant. */
export interface RuleRow {
  id: string;
  ruleCode: string;
  kind: string;
  description: string;
  dimension: string;
  triggerCondition: string;
  adjustment: string;
  priority: number;
  confidence: number;
  isActive: boolean;
  autoApply: boolean;
  cannotOverride: boolean;
  timesTriggered: number;
}

const RULE_ACTIVE_STATUSES = new Set(["Published", "Updated"]);

/** Read an Airtable LEARNING_RULES row into the neutral shape — the exact
 *  inverse of the learning_rule field map (fieldMaps.ts). */
function ruleFromAirtable(r: Record<string, unknown> & { id: string }): RuleRow {
  const adjustment = S(r["Operational_Directive"]) || "{}";
  let dimension = "";
  try {
    const adj = JSON.parse(adjustment) as { dimension?: unknown };
    if (adj && typeof adj.dimension === "string") dimension = adj.dimension;
  } catch {
    /* not an adjustment rule */
  }
  return {
    id: r.id,
    ruleCode: S(r["Instance"]),
    kind: S(r["Rule_Type"]).toLowerCase() === "adjustment" ? "adjustment" : "guidance",
    description: S(r["Rule_Description"]) || S(r["Rule_Name"]),
    dimension,
    triggerCondition: S(r["Trigger_Context"]) || "{}",
    adjustment,
    priority: N(r["Priority"]),
    confidence: N(r["Confidence_Level"]),
    isActive: RULE_ACTIVE_STATUSES.has(S(r["Rule_Status"])),
    autoApply: S(r["Applies_To"]) === "AI Layer Only",
    cannotOverride: r["Override_Permission"] === false,
    timesTriggered: N(r["Times_Triggered"]),
  };
}

export async function getActiveRules(ctx: OrgCtx): Promise<RuleRow[]> {
  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "LEARNING_RULES", { maxRecords: 500 });
    return rows
      .map(ruleFromAirtable)
      .filter((r) => r.isActive)
      .sort((a, b) => a.priority - b.priority || b.confidence - a.confidence);
  }
  const rows = await prisma.platLearningRule.findMany({
    where: { orgId: ctx.orgId, isActive: true },
    orderBy: [{ priority: "asc" }, { confidence: "desc" }],
  });
  return rows.map((r) => ({
    id: String(r.id),
    ruleCode: r.ruleCode,
    kind: r.kind,
    description: r.description,
    dimension: r.dimension,
    triggerCondition: r.triggerCondition,
    adjustment: r.adjustment,
    priority: r.priority,
    confidence: r.confidence,
    isActive: r.isActive,
    autoApply: r.autoApply,
    cannotOverride: r.cannotOverride,
    timesTriggered: r.timesTriggered,
  }));
}

/** Read-only: the org's active GUIDANCE rules matching a context, without
 *  firing them (no counter bumps). Used to make AI analysis learning-aware
 *  before the call, complementing the adjustment rules applied afterwards. */
export async function getMatchingGuidance(
  ctx: OrgCtx,
  context: Record<string, string>,
): Promise<{ ruleCode: string; description: string }[]> {
  const rules = await getActiveRules(ctx);
  return rules
    .filter((r) => r.kind === "guidance" && ruleMatches(r.triggerCondition, context))
    .map((r) => ({ ruleCode: r.ruleCode, description: r.description }));
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
    const newConfidence = Math.min(99, r.confidence + 1);
    const newAutoApply =
      newConfidence >= settings.autoApplyConfidence &&
      r.timesTriggered + 1 >= settings.autoApplyTriggers;
    if (airtableEnabled()) {
      await core.update(ctx.orgSlug, "LEARNING_RULES", r.id, {
        Times_Triggered: r.timesTriggered + 1,
        Confidence_Level: newConfidence,
        Applies_To: newAutoApply ? "AI Layer Only" : "Owner Review",
      });
    } else {
      await prisma.platLearningRule.update({
        where: { id: Number(r.id) },
        data: {
          timesTriggered: { increment: 1 },
          confidence: newConfidence,
          autoApply: newAutoApply,
        },
      });
    }
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

/** Corrections with a variance, from the active backend. */
async function snapshotCorrections(ctx: OrgCtx): Promise<{ variancePct: number | null }[]> {
  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "CORRECTIONS", { maxRecords: 1000 });
    return rows
      .map((r) => ({
        variancePct: typeof r["Variance_Percent"] === "number" ? (r["Variance_Percent"] as number) : null,
      }))
      .filter((c) => c.variancePct != null);
  }
  return prisma.platCorrection.findMany({
    where: { orgId: ctx.orgId, variancePct: { not: null } },
    select: { variancePct: true },
  });
}

/** Count of pending hypotheses, from the active backend. */
async function snapshotPendingHyp(ctx: OrgCtx): Promise<number> {
  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "HYPOTHESES", { maxRecords: 500 });
    return rows.filter((r) => (S(r["Status"]) || "pending") === "pending").length;
  }
  return prisma.platHypothesis.count({ where: { orgId: ctx.orgId, status: "pending" } });
}

export async function snapshotIntelligence(ctx: OrgCtx): Promise<number> {
  // Rules + corrections + hypotheses come from the active backend (Airtable when
  // on); job counts + the snapshot history stay Postgres (snapshots are a local
  // metric log, not migrated).
  const [totalJobs, completedJobs, rules, corrections, pendingHyp, prevSnap] = await Promise.all([
    prisma.platJob.count({ where: { orgId: ctx.orgId } }),
    prisma.platJob.count({ where: { orgId: ctx.orgId, status: { in: ["completed", "archived"] } } }),
    getActiveRules(ctx),
    snapshotCorrections(ctx),
    snapshotPendingHyp(ctx),
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
