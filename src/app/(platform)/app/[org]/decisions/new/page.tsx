import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadReferenceOptions } from "@/lib/platform/configSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createDecision } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewDecisionPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const [jobs, categories] = await Promise.all([
    loadJobOptions(ctx),
    loadReferenceOptions(ctx, "budget_category"),
  ]);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New decision" />
      <form action={createDecision} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Decision *</span>
          <textarea name="description" required rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Rationale</span>
          <textarea name="rationale" rows={3} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job</span>
            <select name="jobId" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="">—</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Category</span>
            <select name="category" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Status</span>
            <select name="status" defaultValue="proposed" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="proposed">Proposed</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </label>
        </div>
        <SubmitButton label="Save decision" />
      </form>
    </div>
  );
}
