import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createRisk } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewRiskPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadJobOptions(ctx);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New risk" />
      <form action={createRisk} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Risk description *</span>
          <textarea name="description" required rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
            <select name="jobId" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Owner</span>
            <input name="owner" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Likelihood (1–5)</span>
            <input type="number" name="likelihood" min={1} max={5} defaultValue={3} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Impact (1–5)</span>
            <input type="number" name="impact" min={1} max={5} defaultValue={3} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Mitigation</span>
          <textarea name="mitigation" rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <SubmitButton label="Add risk" pendingLabel="Adding…" />
      </form>
    </div>
  );
}
