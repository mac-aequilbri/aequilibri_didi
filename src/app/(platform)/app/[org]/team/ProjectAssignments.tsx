"use client";

// Per-member project (job) assignment checklist — the RLS access list editor.
// Collapsed by default; expands to a searchable list of the org's projects with
// the member's current assignments pre-checked. Saving replaces the member's
// whole assignment set (setControlAssignments is delete-then-insert), so the
// search must only HIDE non-matching rows — never unmount them — or filtering
// then saving would silently drop the hidden (still-assigned) projects.

import { useState } from "react";
import { SubmitButton } from "@/components/form/SubmitButton";
import { setMemberAssignmentsAction } from "./actions";

export function ProjectAssignments({
  orgSlug,
  email,
  jobs,
  assigned,
  capped,
}: {
  orgSlug: string;
  email: string;
  jobs: { id: string; label: string }[];
  assigned: string[];
  /** True when the org has more projects than the picker loaded (see page). */
  capped: boolean;
}) {
  const [q, setQ] = useState("");
  const assignedSet = new Set(assigned);
  const needle = q.trim().toLowerCase();

  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-neutral-600 hover:text-neutral-900">
        Projects <span className="text-neutral-400">({assigned.length} assigned)</span>
      </summary>
      <form action={setMemberAssignmentsAction} className="mt-2 w-72 rounded-md border border-neutral-200 p-2">
        <input type="hidden" name="org" value={orgSlug} />
        <input type="hidden" name="email" value={email} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${jobs.length} projects…`}
          className="mb-2 block w-full rounded border border-neutral-300 px-2 py-1"
        />
        <div className="max-h-48 overflow-y-auto pr-1">
          {jobs.map((j) => {
            const match = !needle || j.label.toLowerCase().includes(needle);
            return (
              // Hidden (not unmounted) when filtered out, so its checkbox state
              // is preserved and posted — the save replaces the whole set.
              <label key={j.id} className={`flex items-center gap-2 py-0.5 ${match ? "" : "hidden"}`}>
                <input type="checkbox" name="jobId" value={j.id} defaultChecked={assignedSet.has(j.id)} />
                <span className="truncate">{j.label}</span>
              </label>
            );
          })}
          {jobs.length === 0 && <p className="text-neutral-400">No projects in this org yet.</p>}
        </div>
        {capped && (
          <p className="mt-1 text-amber-700">
            Showing the first {jobs.length} projects only — assigning beyond this needs the
            larger-org picker (not yet built).
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-neutral-400">Unassigned = no access to that project.</span>
          <SubmitButton
            label="Save"
            pendingLabel="Saving…"
            className="rounded-md border border-neutral-300 px-2 py-1 font-medium hover:bg-neutral-50"
          />
        </div>
      </form>
    </details>
  );
}
