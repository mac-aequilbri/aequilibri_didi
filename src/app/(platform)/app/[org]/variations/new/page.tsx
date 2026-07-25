import { CreateForm } from "@/components/form/CreateForm";
import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { aiDraftVariationAction, createVariation } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewVariationPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadJobOptions(ctx);

  const jobSelect = (
    <select name="jobId" required defaultValue="" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
      <option value="" disabled>
        Select a project…
      </option>
      {jobs.map((j) => (
        <option key={j.id} value={j.id}>
          {j.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="p-6 max-w-xl space-y-8">
      <div>
        <PageHeader
          title="AI-drafted variation"
          subtitle="Describe the change; the assistant drafts scope, cost and time impact for your review."
        />
        <CreateForm
          action={aiDraftVariationAction}
          submitLabel="Draft with AI"
          pendingLabel="Drafting…"
          className="ae-card p-5 space-y-4"
        >
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
            {jobSelect}
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Variation brief *</span>
            <textarea
              name="brief"
              required
              rows={3}
              placeholder="e.g. Substitute precast panels with in-situ walls on the L2 east elevation due to supplier capacity"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
        </CreateForm>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">…or create manually</h2>
        <CreateForm action={createVariation} submitLabel="Submit variation" pendingLabel="Submitting…" className="ae-card p-5 space-y-4">
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
            {jobSelect}
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Title *</span>
            <input name="title" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Scope change</span>
            <textarea name="scopeChange" rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-neutral-600">Cost impact $</span>
              <input type="number" step="0.01" name="costImpact" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Time impact (days)</span>
              <input type="number" name="timeImpactDays" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
            </label>
          </div>
        </CreateForm>
      </div>
    </div>
  );
}
