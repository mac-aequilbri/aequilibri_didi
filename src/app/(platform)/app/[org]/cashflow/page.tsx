// Cashflow — projected vs actual per period per job.

import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { currency, toNum } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { updateCashflowActual } from "./actions";

export const dynamic = "force-dynamic";

export default async function CashflowPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { code: "asc" },
    include: { conCashflows: { orderBy: { period: "asc" } } },
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Cashflow"
        subtitle="Projected vs actual by month."
        actions={[{ href: orgPath(ctx.orgSlug, "/cashflow/new"), label: "+ New period" }]}
      />
      {jobs.map((job) => {
        if (!job.conCashflows.length) return null;
        return (
          <section key={job.id} className="ae-card p-5 mb-6">
            <h2 className="font-semibold mb-3">
              {job.name} <span className="text-xs font-normal text-neutral-500">{job.code}</span>
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-2">Period</th>
                  <th className="py-1 pr-2 text-right">Projected</th>
                  <th className="py-1 pr-2 text-right">Actual</th>
                  <th className="py-1 pr-2 text-right">Variance</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {job.conCashflows.map((c) => {
                  const projected = toNum(c.projected);
                  const actual = toNum(c.actual);
                  const variance = projected
                    ? Math.round(((actual - projected) / projected) * 1000) / 10
                    : 0;
                  return (
                    <tr key={c.id} className="border-t border-neutral-100">
                      <td className="py-2 pr-2 font-medium whitespace-nowrap">
                        {c.period}
                        {c.notes && (
                          <span className="block text-xs font-normal text-neutral-500">{c.notes}</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(projected)}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(actual)}</td>
                      <td
                        className={`py-2 pr-2 text-right text-xs font-semibold ${actual > projected ? "text-red-600" : "text-emerald-700"}`}
                      >
                        {actual === 0 ? "—" : `${variance > 0 ? "+" : ""}${variance}%`}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <form action={updateCashflowActual} className="inline-flex items-center gap-1">
                          <input type="hidden" name="org" value={ctx.orgSlug} />
                          <input type="hidden" name="recordId" value={c.id} />
                          <input
                            type="number"
                            step="0.01"
                            name="actual"
                            defaultValue={actual || ""}
                            placeholder="actual"
                            className="w-24 text-xs border border-neutral-200 rounded px-1 py-0.5 text-right"
                          />
                          <button type="submit" className="btn-ae-outline text-xs">
                            Set
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      {jobs.every((j) => !j.conCashflows.length) && (
        <p className="text-sm text-neutral-500">No cashflow entries yet.</p>
      )}
    </div>
  );
}
