// Editable budget breakdown on the assessment review screen. The estimator can
// add, remove and adjust lines; the total recalculates live and is saved via
// refineBudgetAction (which also updates the assessment's budget_total). An AI
// sanity-check rates the breakdown against the scope and flags lines that look
// off — it does not overwrite anything.
"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { currency } from "@/lib/format";
import { refineBudgetAction, checkBudgetAction } from "./actions";
import type { BudgetReviewResult } from "@/services/platform/construction/budgetReview";

export interface BudgetLine {
  category: string;
  amount: number;
}

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || !dirty} className="btn-ae text-sm disabled:opacity-40">
      {pending ? "Saving…" : dirty ? "Save budget" : "Saved"}
    </button>
  );
}

const VERDICT_STYLE: Record<BudgetReviewResult["verdict"], { label: string; box: string; chip: string }> = {
  ok: { label: "Looks reasonable", box: "bg-emerald-50 border-emerald-200 text-emerald-900", chip: "bg-emerald-600" },
  review: { label: "Worth a look", box: "bg-amber-50 border-amber-200 text-amber-900", chip: "bg-amber-500" },
  off: { label: "Looks off", box: "bg-red-50 border-red-200 text-red-900", chip: "bg-red-600" },
};

export function BudgetRefiner({
  orgSlug,
  assessmentId,
  initial,
  categoryLabel,
  scope,
  sizeSqm,
}: {
  orgSlug: string;
  assessmentId: string | number;
  initial: BudgetLine[];
  categoryLabel?: string;
  scope?: string;
  sizeSqm?: number | null;
}) {
  const [lines, setLines] = useState<BudgetLine[]>(initial.length ? initial : [{ category: "", amount: 0 }]);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<BudgetReviewResult | null>(null);
  const [checking, startCheck] = useTransition();

  const mutate = (next: BudgetLine[]) => {
    setLines(next);
    setDirty(true);
    setResult(null);
  };
  const rename = (i: number, category: string) => mutate(lines.map((l, j) => (j === i ? { ...l, category } : l)));
  const reprice = (i: number, amount: number) =>
    mutate(lines.map((l, j) => (j === i ? { ...l, amount: Math.max(0, amount) } : l)));
  const remove = (i: number) => mutate(lines.filter((_, j) => j !== i));
  const add = () => mutate([...lines, { category: "", amount: 0 }]);

  const named = lines.filter((l) => l.category.trim().length > 0);
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const valid = named.length > 0;

  const runCheck = () => {
    setResult(null);
    startCheck(async () => {
      const res = await checkBudgetAction({
        org: orgSlug,
        lines: named.map((l) => ({ category: l.category.trim(), amount: Number(l.amount) || 0 })),
        context: { categoryLabel, scope, sizeSqm },
      });
      setResult(res);
    });
  };

  const style = result ? VERDICT_STYLE[result.verdict] : null;

  return (
    <form action={refineBudgetAction} className="space-y-3">
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input type="hidden" name="budget" value={JSON.stringify(named)} />

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={l.category}
              onChange={(e) => rename(i, e.target.value)}
              placeholder="Line item"
              className="flex-1 min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-neutral-400">$</span>
              <input
                type="number"
                min={0}
                step={1}
                value={l.amount}
                onChange={(e) => reprice(i, Number(e.target.value))}
                className="w-28 rounded border border-neutral-300 px-2 py-1.5 text-sm text-right"
                aria-label={`Amount for line ${i + 1}`}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove line"
              className="px-1.5 py-1 text-neutral-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {style && result && (
        <div className={`rounded-lg border p-3 text-sm ${style.box}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[11px] font-semibold uppercase tracking-wide text-white px-2 py-0.5 rounded-full ${style.chip}`}>
              {style.label}
            </span>
            {result.demo && (
              <span className="text-[11px] text-neutral-500 border border-neutral-300 rounded-full px-2 py-0.5">
                Offline check
              </span>
            )}
          </div>
          <p className="mb-2">{result.summary}</p>
          {result.issues.length > 0 && (
            <ul className="space-y-1.5">
              {result.issues.map((it, k) => (
                <li key={k} className="flex gap-2">
                  <span aria-hidden className="select-none">•</span>
                  <span>
                    <span className="font-medium">{it.line}</span>
                    {" — "}
                    {it.note}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={add} className="btn-ae-outline text-sm">
            + Add line
          </button>
          <button
            type="button"
            onClick={runCheck}
            disabled={!valid || checking}
            className="btn-ae-outline text-sm disabled:opacity-40"
            title="Sanity-check these numbers against the scope"
          >
            {checking ? "Checking…" : "✦ AI budget check"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{currency(total)}</span>
          <SaveButton dirty={dirty && valid} />
        </div>
      </div>
    </form>
  );
}
