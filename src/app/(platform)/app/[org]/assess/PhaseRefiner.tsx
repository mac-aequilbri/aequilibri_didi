// Editable project-phase plan on the assessment review screen. Phases are
// generated learnings-first (from prior jobs) or by the AI; here the estimator
// refines them — rename, re-time, add, remove, reorder — before acceptance.
// The list is serialised into a hidden field and saved via refinePhasesAction.
// An AI feasibility check rates the edited timeline and, when it's off, offers
// a corrected plan the estimator can apply in one click.
"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { refinePhasesAction, checkPhaseFeasibilityAction } from "./actions";
import type { FeasibilityResult } from "@/services/platform/construction/phaseFeasibility";

export interface Phase {
  name: string;
  weeks: number;
}

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="btn-ae text-sm disabled:opacity-40"
    >
      {pending ? "Saving…" : dirty ? "Save phase plan" : "Saved"}
    </button>
  );
}

const VERDICT_STYLE: Record<FeasibilityResult["verdict"], { label: string; box: string; chip: string }> = {
  ok: { label: "Looks realistic", box: "bg-emerald-50 border-emerald-200 text-emerald-900", chip: "bg-emerald-600" },
  tight: { label: "Tight", box: "bg-amber-50 border-amber-200 text-amber-900", chip: "bg-amber-500" },
  unrealistic: { label: "Unrealistic", box: "bg-red-50 border-red-200 text-red-900", chip: "bg-red-600" },
};

export function PhaseRefiner({
  orgSlug,
  assessmentId,
  initial,
  categoryLabel,
  engagementType,
  scope,
  sizeSqm,
}: {
  orgSlug: string;
  assessmentId: number;
  initial: Phase[];
  categoryLabel?: string;
  engagementType?: string;
  scope?: string;
  sizeSqm?: number | null;
}) {
  const [phases, setPhases] = useState<Phase[]>(initial.length ? initial : [{ name: "", weeks: 1 }]);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<FeasibilityResult | null>(null);
  const [checking, startCheck] = useTransition();

  const mutate = (next: Phase[]) => {
    setPhases(next);
    setDirty(true);
    setResult(null); // any edit invalidates the last feasibility check
  };
  const rename = (i: number, name: string) => mutate(phases.map((p, j) => (j === i ? { ...p, name } : p)));
  const retime = (i: number, weeks: number) =>
    mutate(phases.map((p, j) => (j === i ? { ...p, weeks: Math.max(0, weeks) } : p)));
  const remove = (i: number) => mutate(phases.filter((_, j) => j !== i));
  const add = () => mutate([...phases, { name: "", weeks: 1 }]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= phases.length) return;
    const next = [...phases];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  };

  const named = phases.filter((p) => p.name.trim().length > 0);
  const totalWeeks = phases.reduce((s, p) => s + (Number(p.weeks) || 0), 0);
  const valid = named.length > 0;

  const runCheck = () => {
    setResult(null);
    startCheck(async () => {
      const res = await checkPhaseFeasibilityAction({
        org: orgSlug,
        phases: named.map((p) => ({ name: p.name.trim(), weeks: Number(p.weeks) || 0 })),
        context: { categoryLabel, engagementType, scope, sizeSqm },
      });
      setResult(res);
    });
  };

  const applySuggested = () => {
    const plan = result?.suggestedPlan;
    if (!plan?.length) return;
    mutate(plan.map((p) => ({ name: p.name, weeks: p.weeks })));
  };

  const style = result ? VERDICT_STYLE[result.verdict] : null;

  return (
    <form action={refinePhasesAction} className="space-y-3">
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input type="hidden" name="phases" value={JSON.stringify(named)} />

      <div className="space-y-2">
        {phases.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 w-5 text-right">{i + 1}</span>
            <input
              value={p.name}
              onChange={(e) => rename(i, e.target.value)}
              placeholder="Phase name"
              className="flex-1 min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              min={0}
              value={p.weeks}
              onChange={(e) => retime(i, Number(e.target.value))}
              className="w-14 rounded border border-neutral-300 px-2 py-1.5 text-sm"
              aria-label={`Weeks for phase ${i + 1}`}
            />
            <span className="text-xs text-neutral-400">wk</span>
            <div className="flex items-center">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="px-1.5 py-1 text-neutral-500 disabled:opacity-25 hover:text-[var(--ae-space)]">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === phases.length - 1} aria-label="Move down" className="px-1.5 py-1 text-neutral-500 disabled:opacity-25 hover:text-[var(--ae-space)]">↓</button>
              <button type="button" onClick={() => remove(i)} aria-label="Remove phase" className="px-1.5 py-1 text-neutral-400 hover:text-red-600">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* AI feasibility result */}
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
                    <span className="font-medium">{it.phase}</span>
                    {" — "}
                    {it.note}
                    {typeof it.suggestedWeeks === "number" && (
                      <span className="ml-1 text-xs font-medium opacity-80">
                        (suggest {it.suggestedWeeks} wk)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.suggestedPlan && result.suggestedPlan.length > 0 && (
            <button
              type="button"
              onClick={applySuggested}
              className="btn-ae-outline text-xs mt-3"
            >
              Apply suggested timeline ({result.suggestedPlan.reduce((s, p) => s + p.weeks, 0)} wk)
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={add} className="btn-ae-outline text-sm">
            + Add phase
          </button>
          <button
            type="button"
            onClick={runCheck}
            disabled={!valid || checking}
            className="btn-ae-outline text-sm disabled:opacity-40"
            title="Check whether these durations are realistic for the job"
          >
            {checking ? "Checking…" : "✦ AI feasibility check"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {named.length} phases · {totalWeeks} wk total
          </span>
          <SaveButton dirty={dirty && valid} />
        </div>
      </div>
    </form>
  );
}
