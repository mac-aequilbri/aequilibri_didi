// AI sanity-check for an edited budget breakdown. Given the job context and the
// estimator's budget lines, asks Claude whether the numbers look plausible for
// the scope and flags lines that look off — it does NOT rewrite the budget.
// Falls back to a deterministic heuristic when no API key is configured (demo
// parity) or the model errors.

import { callClaude } from "@/lib/claude";

export interface BudgetLineInput {
  category: string;
  amount: number;
}

export type BudgetVerdict = "ok" | "review" | "off";

export interface BudgetIssue {
  /** Category the issue relates to, or "Overall" for whole-budget notes. */
  line: string;
  note: string;
}

export interface BudgetReviewResult {
  verdict: BudgetVerdict;
  summary: string;
  issues: BudgetIssue[];
  demo: boolean;
}

export interface BudgetReviewContext {
  categoryLabel?: string;
  scope?: string;
  sizeSqm?: number | null;
}

const SYSTEM = `You are a senior Australian construction estimator reviewing a budget breakdown for plausibility.
You are given a job's scope and a list of budget line items (category + amount in AUD, ex-GST).
Flag lines that look materially wrong for the scope — implausibly high or low, an essential item missing, or apparent double-counting. Do NOT rewrite the budget.

Respond with ONLY a JSON object — no prose, no markdown fences:
{
  "verdict": "ok" | "review" | "off",
  "summary": "one plain-English sentence",
  "issues": [ { "line": "<category or 'Overall'>", "note": "what looks off and why" } ]
}
Rules:
- "issues" is an empty array when the budget looks sound.
- "ok" = sound; "review" = a couple of lines worth a second look; "off" = the total or key lines look clearly wrong for the scope.`;

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

export async function reviewBudget(
  lines: BudgetLineInput[],
  context: BudgetReviewContext,
): Promise<BudgetReviewResult> {
  const cleaned = lines
    .map((l) => ({ category: String(l.category ?? "").trim(), amount: Math.round((Number(l.amount) || 0) * 100) / 100 }))
    .filter((l) => l.category);

  if (cleaned.length === 0) {
    return { verdict: "off", summary: "Add at least one budget line before reviewing.", issues: [], demo: true };
  }

  const total = cleaned.reduce((s, l) => s + l.amount, 0);
  const ctxLines = [
    context.categoryLabel ? `Job category: ${context.categoryLabel}` : null,
    context.sizeSqm ? `Approx size / roof area: ${context.sizeSqm} m2` : null,
    context.scope ? `Scope: ${context.scope}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userMessage =
    `${ctxLines || "Job context: not specified."}\n\n` +
    `Budget breakdown (${cleaned.length} lines, $${total.toLocaleString()} ex-GST total):\n` +
    cleaned.map((l) => `- ${l.category}: $${l.amount.toLocaleString()}`).join("\n") +
    `\n\nReview for plausibility.`;

  const { content, demo_mode } = await callClaude(SYSTEM, userMessage, { maxTokens: 1000 });
  if (demo_mode) return heuristic(cleaned);

  const parsed = extractJson(content);
  if (!parsed) return heuristic(cleaned);

  const verdict: BudgetVerdict =
    parsed.verdict === "ok" || parsed.verdict === "review" || parsed.verdict === "off" ? parsed.verdict : "review";
  const issues: BudgetIssue[] = Array.isArray(parsed.issues)
    ? (parsed.issues as unknown[])
        .map((raw) => {
          const it = raw as { line?: unknown; note?: unknown };
          return { line: String(it?.line ?? "Overall").trim() || "Overall", note: String(it?.note ?? "").trim() };
        })
        .filter((it) => it.note)
    : [];

  return {
    verdict,
    summary:
      String(parsed.summary ?? "").trim() ||
      (verdict === "ok" ? "The budget looks reasonable." : "Some lines are worth a second look."),
    issues,
    demo: false,
  };
}

/** Offline fallback — catches the obvious without a model. */
function heuristic(lines: BudgetLineInput[]): BudgetReviewResult {
  const issues: BudgetIssue[] = [];
  lines.forEach((l) => {
    if (l.amount <= 0) issues.push({ line: l.category, note: "Amount is zero — set a value or remove the line." });
  });
  const verdict: BudgetVerdict = issues.length ? "review" : "ok";
  return {
    verdict,
    summary:
      verdict === "ok"
        ? "Line amounts are all set (offline check — connect AI for a detailed review)."
        : "Some lines need an amount (offline check).",
    issues,
    demo: true,
  };
}
