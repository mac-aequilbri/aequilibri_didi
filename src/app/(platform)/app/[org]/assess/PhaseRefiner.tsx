// Editable project-phase plan on the assessment review screen. Phases are
// generated learnings-first (from prior jobs) or by the AI; here the estimator
// refines them — rename, re-time, add, remove, reorder — before acceptance.
// The list is serialised into a hidden field and saved via refinePhasesAction.
"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { refinePhasesAction } from "./actions";

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

export function PhaseRefiner({
  orgSlug,
  assessmentId,
  initial,
}: {
  orgSlug: string;
  assessmentId: number;
  initial: Phase[];
}) {
  const [phases, setPhases] = useState<Phase[]>(initial.length ? initial : [{ name: "", weeks: 1 }]);
  const [dirty, setDirty] = useState(false);

  const mutate = (next: Phase[]) => {
    setPhases(next);
    setDirty(true);
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

  const totalWeeks = phases.reduce((s, p) => s + (Number(p.weeks) || 0), 0);
  const valid = phases.some((p) => p.name.trim().length > 0);

  return (
    <form action={refinePhasesAction} className="space-y-3">
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input
        type="hidden"
        name="phases"
        value={JSON.stringify(phases.filter((p) => p.name.trim().length > 0))}
      />

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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <button type="button" onClick={add} className="btn-ae-outline text-sm">
          + Add phase
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {phases.filter((p) => p.name.trim()).length} phases · {totalWeeks} wk total
          </span>
          <SaveButton dirty={dirty && valid} />
        </div>
      </div>
    </form>
  );
}
