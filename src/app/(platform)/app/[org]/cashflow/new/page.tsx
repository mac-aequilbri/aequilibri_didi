import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireFinancialAccess, requireOrgCtx } from "@/lib/platform/org-context";
import { createCashflowEntry } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCashflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  await requireFinancialAccess(ctx);
  const { error } = await searchParams;
  const jobs = await loadJobOptions(ctx);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New cashflow entry" />
      {error === "save_failed" && (
        <p role="alert" className="text-red-600 text-sm mb-3">
          The entry couldn&apos;t be saved — the org&apos;s base rejected the write. Check the
          server log for details.
        </p>
      )}
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
            <input name="period" required pattern="\d{4}-(0[1-9]|1[0-2])" title="Use the format YYYY-MM, e.g. 2026-07" placeholder="2026-07" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
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
            <input type="number" step="0.01" min={0} inputMode="decimal" name="amount" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
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
        <SubmitButton label="Add entry" pendingLabel="Adding…" />
      </form>
    </div>
  );
}
