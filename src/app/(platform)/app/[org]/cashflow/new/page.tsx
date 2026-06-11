import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createCashflowEntry } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCashflowPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New cashflow period" />
      <form action={createCashflowEntry} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
            <select name="jobId" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} — {j.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Period (YYYY-MM) *</span>
            <input name="period" required pattern="\d{4}-\d{2}" placeholder="2026-07" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Projected $</span>
            <input type="number" step="0.01" name="projected" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Actual $</span>
            <input type="number" step="0.01" name="actual" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Notes</span>
          <input name="notes" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <button type="submit" className="btn-ae">
          Add period
        </button>
      </form>
    </div>
  );
}
