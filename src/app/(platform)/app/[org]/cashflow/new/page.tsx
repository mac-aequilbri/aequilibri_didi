import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createCashflowEntry } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCashflowPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadJobOptions(ctx);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New cashflow entry" />
      <form action={createCashflowEntry} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Description *</span>
          <input name="name" required placeholder="e.g. Progress claim #2" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
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
            <span className="text-neutral-600">Period (YYYY-MM) *</span>
            <input name="period" required pattern="\d{4}-\d{2}" placeholder="2026-07" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Type</span>
            <select name="type" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="Out">Out</option>
              <option value="In">In</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Amount $</span>
            <input type="number" step="0.01" name="amount" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Source / Payee</span>
            <input name="sourceOrPayee" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Status</span>
            <select name="status" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="Forecast">Forecast</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Category</span>
          <input name="category" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Notes</span>
          <input name="notes" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <button type="submit" className="btn-ae">
          Add entry
        </button>
      </form>
    </div>
  );
}
