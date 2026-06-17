// AI feasibility check for a refined project-phase plan. Given the job context
// and the estimator's edited phases, asks Claude whether the timeline is
// realistic and returns per-phase recommendations (and, when off, a corrected
// plan the user can apply in one click). Falls back to a deterministic
// heuristic when no API key is configured (demo parity) or the model errors —
// same "configured → real, absent → demo" contract as the rest of the platform.

import { callClaude } from "@/lib/claude";

export interface FeasibilityPhase {
  name: string;
  weeks: number;
}

export type FeasibilityVerdict = "ok" | "tight" | "unrealistic";

export interface FeasibilityIssue {
  /** Phase name the issue relates to, or "Overall" for whole-plan notes. */
  phase: string;
  note: string;
  /** Recommended duration for this phase, when the model suggests one. */
  suggestedWeeks?: number;
}

export interface FeasibilityResult {
  verdict: FeasibilityVerdict;
  summary: string;
  issues: FeasibilityIssue[];
  /** A full corrected plan the user can apply in one click, when offered. */
  suggestedPlan?: FeasibilityPhase[];
  /** True when the result came from the offline heuristic, not the model. */
  demo: boolean;
}

export interface FeasibilityContext {
  categoryLabel?: string;
  engagementType?: string;
  scope?: string;
  sizeSqm?: number | null;
}

const SYSTEM = `You are a senior Australian residential construction project planner.
You are given a job's scope and a proposed plan of sequential phases, each with a duration in whole weeks.
Judge whether the durations and the overall timeline are realistic for that scope — accounting for trades, curing/drying, inspections, weather, and material lead times.
Be concrete: a whole new house in 1-2 weeks is unrealistic; a strip-and-reroof compressed into a single week may be tight but possible on a small roof.

Respond with ONLY a JSON object — no prose, no markdown fences:
{
  "verdict": "ok" | "tight" | "unrealistic",
  "summary": "one plain-English sentence",
  "issues": [ { "phase": "<phase name or 'Overall'>", "note": "what is wrong and why", "suggestedWeeks": <integer, optional> } ],
  "suggestedPlan": [ { "name": "<phase>", "weeks": <integer> } ]
}
Rules:
- "issues" is an empty array when the plan is sound.
- Include "suggestedPlan" ONLY when verdict is "tight" or "unrealistic". Keep the same phases in the same order, adjusting only the week counts.
- Durations are whole weeks, minimum 1 for any real phase. Keep recommendations realistic, not padded.`;

function extractJson(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/```json/gi, "").replace(/```/g, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toInt(v: unknown, min = 0): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.round(n)) : undefined;
}

function normalizePlan(v: unknown): FeasibilityPhase[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((p) => ({
      name: String((p as { name?: unknown })?.name ?? "").trim(),
      weeks: toInt((p as { weeks?: unknown })?.weeks, 0) ?? 0,
    }))
    .filter((p) => p.name);
  return out.length ? out : undefined;
}

export async function checkPhaseFeasibility(
  phases: FeasibilityPhase[],
  context: FeasibilityContext,
): Promise<FeasibilityResult> {
  const cleaned = phases
    .map((p) => ({ name: String(p.name ?? "").trim(), weeks: toInt(p.weeks, 0) ?? 0 }))
    .filter((p) => p.name);

  if (cleaned.length === 0) {
    return {
      verdict: "unrealistic",
      summary: "Add at least one named phase before checking feasibility.",
      issues: [],
      demo: true,
    };
  }

  const total = cleaned.reduce((s, p) => s + p.weeks, 0);
  const ctxLines = [
    context.categoryLabel ? `Job category: ${context.categoryLabel}` : null,
    context.engagementType ? `Engagement type: ${context.engagementType}` : null,
    context.sizeSqm ? `Approx size: ${context.sizeSqm} m2` : null,
    context.scope ? `Scope: ${context.scope}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userMessage =
    `${ctxLines || "Job context: not specified."}\n\n` +
    `Proposed plan (${cleaned.length} phases, ${total} weeks total):\n` +
    cleaned.map((p, i) => `${i + 1}. ${p.name} - ${p.weeks} wk`).join("\n") +
    `\n\nAssess feasibility.`;

  const { content, demo_mode } = await callClaude(SYSTEM, userMessage, { maxTokens: 1200 });
  if (demo_mode) return heuristic(cleaned, context);

  const parsed = extractJson(content);
  if (!parsed) return heuristic(cleaned, context);

  const verdict: FeasibilityVerdict =
    parsed.verdict === "ok" || parsed.verdict === "tight" || parsed.verdict === "unrealistic"
      ? parsed.verdict
      : "tight";

  const issues: FeasibilityIssue[] = Array.isArray(parsed.issues)
    ? (parsed.issues as unknown[])
        .map((raw) => {
          const it = raw as { phase?: unknown; note?: unknown; suggestedWeeks?: unknown };
          return {
            phase: String(it?.phase ?? "Overall").trim() || "Overall",
            note: String(it?.note ?? "").trim(),
            suggestedWeeks: toInt(it?.suggestedWeeks, 0),
          };
        })
        .filter((it) => it.note)
    : [];

  return {
    verdict,
    summary:
      String(parsed.summary ?? "").trim() ||
      (verdict === "ok" ? "The plan looks realistic." : "The plan needs adjustment."),
    issues,
    suggestedPlan: verdict === "ok" ? undefined : normalizePlan(parsed.suggestedPlan),
    demo: false,
  };
}

/**
 * Offline fallback. Catches the obvious red flags without a model: zero-week
 * phases, full-build plans compressed into a handful of weeks, and plans where
 * nearly every phase is under a week.
 */
function heuristic(phases: FeasibilityPhase[], context: FeasibilityContext): FeasibilityResult {
  const issues: FeasibilityIssue[] = [];
  const suggested: FeasibilityPhase[] = phases.map((p) => ({ ...p }));

  phases.forEach((p, i) => {
    if (p.weeks <= 0) {
      issues.push({ phase: p.name, note: "No duration set — every real phase needs at least a week.", suggestedWeeks: 1 });
      suggested[i].weeks = 1;
    }
  });

  const total = phases.reduce((s, p) => s + Math.max(0, p.weeks), 0);
  const label = `${context.categoryLabel ?? ""} ${context.engagementType ?? ""} ${context.scope ?? ""}`.toLowerCase();
  const isFullBuild = /(new build|new home|new house|full build|whole house|construction|knockdown|rebuild)/.test(label);

  if (isFullBuild && total < 16) {
    issues.push({
      phase: "Overall",
      note: `A full house build in ${total} week${total === 1 ? "" : "s"} is not realistic — these typically run 16-40 weeks once trades, curing, inspections and weather are allowed for.`,
    });
  }

  if (phases.length >= 4 && total < phases.length) {
    issues.push({
      phase: "Overall",
      note: "Most phases are under a week; sequential trades and inspections rarely compress this far.",
    });
  }

  const hasOverall = issues.some((i) => i.phase === "Overall");
  const verdict: FeasibilityVerdict = hasOverall ? "unrealistic" : issues.length ? "tight" : "ok";
  const summary =
    verdict === "ok"
      ? "Durations look broadly reasonable (offline check — connect AI for a detailed review)."
      : verdict === "unrealistic"
        ? "The timeline looks unrealistic for this scope (offline check)."
        : "A few phases need a longer duration (offline check).";

  // Only offer to apply a plan we actually corrected (zero-week bumps); we won't
  // fabricate a full schedule for the whole-build case offline.
  const changed = suggested.some((p, i) => p.weeks !== phases[i].weeks);

  return { verdict, summary, issues, suggestedPlan: changed ? suggested : undefined, demo: true };
}
