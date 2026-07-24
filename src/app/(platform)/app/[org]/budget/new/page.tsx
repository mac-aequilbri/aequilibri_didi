import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadReferenceOptions } from "@/lib/platform/configSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireFinancialAccess, requireOrgCtx } from "@/lib/platform/org-context";
import { createBudgetLine } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewBudgetLinePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  await requireFinancialAccess(ctx);
  const { error } = await searchParams;
  const [jobs, categories] = await Promise.all([
    loadJobOptions(ctx),
    loadReferenceOptions(ctx, "budget_category"),
  ]);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New budget line" />
      {error === "save_failed" && (
        <p role="alert" className="text-red-600 text-sm mb-3">
          The budget line couldn&apos;t be saved — the org&apos;s base rejected the write. Check
          the server log for details.
        </p>
      )}
      <form action={createBudgetLine} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
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
