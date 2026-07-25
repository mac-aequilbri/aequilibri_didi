// New plan task — Project is required on create (project RLS convention);
// Phase is optional and offered per project. Predecessor links are a
// second-pass edit (onboarding playbook) until the L5 Gantt lands.

import { DateField } from "@/components/form/DateField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { loadPhaseJobs } from "@/lib/platform/phasesSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createPlanTask } from "../actions";

export const dynamic = "force-dynamic";

const STATUSES = ["Not Started", "In Progress", "Complete", "Blocked", "Deferred"];

export default async function NewPlanTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { error } = await searchParams;
  const [jobs, phaseJobs] = await Promise.all([loadJobOptions(ctx), loadPhaseJobs(ctx)]);
  // Phase options grouped per job; RLS-scoped by loadPhaseJobs already.
  const phaseGroups = phaseJobs.filter((j) => j.conPhases.length > 0);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New plan task" subtitle="What happens when — a task on the engagement schedule." />
      {error === "save_failed" && (
        <p role="alert" className="text-ae-danger text-sm mb-3">
          The task couldn&apos;t be saved — the org&apos;s base rejected the write. Check the
          server log for details.
        </p>
      )}
      <form action={createPlanTask} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Task *</span>
          <input name="name" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Project *</span>
            <select name="jobId" required defaultValue="" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="" disabled>Select a project…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Phase</span>
            <select name="phaseId" defaultValue="" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="">—</option>
              {phaseGroups.map((j) => (
                <optgroup key={j.id} label={j.name}>
                  {j.conPhases.map((ph) => (
                    <option key={ph.id} value={ph.id}>
                      {ph.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Status</span>
            <select name="status" defaultValue="Not Started" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Duration (days)</span>
            <input
              name="durationDays"
              type="number"
              min={0}
              step={1}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <DateField name="startDate" label="Start date" />
          <DateField name="endDate" label="End date" />
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Notes</span>
          <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <SubmitButton label="Add task" pendingLabel="Adding…" />
      </form>
    </div>
  );
}
