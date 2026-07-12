import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadReferenceOptions } from "@/lib/platform/configSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createBudgetLine } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewBudgetLinePage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const [jobs, categories] = await Promise.all([
    loadJobOptions(ctx),
    loadReferenceOptions(ctx, "budget_category"),
  ]);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New budget line" />
      <form action={createBudgetLine} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
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
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Description</span>
          <input name="description" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-3 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Budget $</span>
            <input type="number" step="0.01" min={0} inputMode="decimal" name="budgetAmount" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Committed $</span>
            <input type="number" step="0.01" min={0} inputMode="decimal" name="committedAmount" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Actual $</span>
            <input type="number" step="0.01" min={0} inputMode="decimal" name="actualAmount" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <SubmitButton label="Add budget line" pendingLabel="Adding…" />
      </form>
    </div>
  );
}
