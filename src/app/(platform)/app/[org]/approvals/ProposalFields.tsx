// Client-side field diff for a proposal card. The card itself stays a
// server-rendered <form>; this child only tracks whether the reviewer has
// actually changed any editable field value, and reveals the root-cause
// ("why was the proposal wrong?") inputs only once an edit exists — an
// untouched approval shouldn't ask for a correction category. All input
// names are identical to the previous server markup, so approveProposalAction
// is unchanged.
"use client";

import { useState } from "react";

export interface ProposalChange {
  key: string;
  /** null = this field is a new addition (create / newly-set). */
  before: string | null;
  after: string;
  /** Raw string form of the proposed value when the field is editable. */
  raw: string | null;
}

export function ProposalFields({
  changes,
  editable,
}: {
  changes: ProposalChange[];
  editable: boolean;
}) {
  const [edited, setEdited] = useState<Record<string, boolean>>({});
  const anyEdited = Object.values(edited).some(Boolean);

  return (
    <>
      <dl className="mt-3 pt-3 border-t border-neutral-100 space-y-1.5 text-sm">
        {changes.length === 0 && <p className="text-xs text-neutral-400">No effective change.</p>}
        {changes.map((c) => (
          <div key={c.key} className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-[0.7rem] uppercase tracking-wide text-neutral-400 w-32 shrink-0">
              {c.key}
            </dt>
            <dd className="min-w-0 text-neutral-700 flex-1">
              {c.raw !== null ? (
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  {c.before !== null && (
                    <>
                      <span className="line-through text-neutral-400">{c.before}</span>
                      <span className="text-neutral-300">→</span>
                    </>
                  )}
                  <input
                    name={`field:${c.key}`}
                    defaultValue={c.raw}
                    onChange={(e) =>
                      setEdited((prev) => ({ ...prev, [c.key]: e.target.value !== c.raw }))
                    }
                    className="flex-1 min-w-40 rounded border border-neutral-200 px-1.5 py-0.5 text-sm font-medium text-[var(--ae-space-deep)] focus:border-neutral-400 focus:outline-none"
                  />
                </span>
              ) : c.before === null ? (
                <span className="text-[var(--ae-success)]">{c.after}</span>
              ) : (
                <>
                  <span className="line-through text-neutral-400">{c.before}</span>
                  <span className="mx-1.5 text-neutral-300">→</span>
                  <span className="font-medium text-[var(--ae-space-deep)]">{c.after}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {editable && anyEdited && (
        <div className="mt-3 pt-3 border-t border-neutral-100 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>You corrected a value — why was the proposal wrong?</span>
          <select
            name="rootCauseCategory"
            defaultValue="Estimation Error"
            className="rounded border border-neutral-200 px-1.5 py-0.5 text-xs"
          >
            <option>Estimation Error</option>
            <option>Data Quality</option>
            <option>Scope Change</option>
            <option>External Factor</option>
            <option>Model Error</option>
          </select>
          <input
            name="rootCauseNote"
            placeholder="Optional note (e.g. supplier quote superseded)"
            className="flex-1 min-w-48 rounded border border-neutral-200 px-1.5 py-0.5 text-xs"
          />
        </div>
      )}
    </>
  );
}
