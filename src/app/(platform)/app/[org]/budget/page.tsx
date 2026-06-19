// Budget vs actual per job, with inline actual updates (human-only writes).

import { prisma } from "@/lib/db";
import { BarsCompare } from "@/components/charts";
import { EmptyState, MetricCard, PageHeader } from "@/components/PageHeader";
import { currency, toNum } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { updateBudgetActual } from "./actions";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { code: "asc" },
    include: {
      conBudgets: { orderBy: [{ category: "asc" }], include: { phase: { select: { name: true } } } },
    },
  });

  const all = jobs.flatMap((j) => j.conBudgets);
  const totBudget = all.reduce((s, b) => s + toNum(b.budgetAmount), 0);
  const totCommitted = all.reduce((s, b) => s + toNum(b.committedAmount), 0);
  const totActual = all.reduce((s, b) => s + toNum(b.actualAmount), 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Budget"
        subtitle="Estimated vs committed vs actual; human-entered actuals are protected from AI writes by the approval gate."
        actions={[{ href: orgPath(ctx.orgSlug, "/budget/new"), label: "+ New line" }]}
      />
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <MetricCard value={currency(totBudget)} label="Budget" />
        <MetricCard value={currency(totCommitted)} label="Committed" />
        <MetricCard value={currency(totActual)} label="Actual" />
      </div>

      {(() => {
        const byCategory = new Map<string, { primary: number; secondary: number }>();
        for (const b of all) {
          const key = b.category || b.description || "Other";
          const agg = byCategory.get(key) ?? { primary: 0, secondary: 0 };
          agg.primary += toNum(b.budgetAmount);
          agg.secondary += toNum(b.actualAmount);
          byCategory.set(key, agg);
        }
        const rows = [...byCategory.entries()]
          .map(([label, v]) => ({ label, ...v }))
          .sort((a, b) => b.primary - a.primary)
          .slice(0, 10);
        if (!rows.length) return null;
        return (
          <section className="ae-card p-5 mb-6">
            <h2 className="font-semibold mb-3">Budget vs actual by category</h2>
            <BarsCompare
              rows={rows}
              primaryLabel="Budget"
              secondaryLabel="Actual"
              formatValue={(n) => currency(n)}
            />
          </section>
        );
      })()}

      {jobs.map((job) => {
        const lines = job.conBudgets;
        if (!lines.length) return null;
        return (
          <section key={job.id} className="ae-card p-5 mb-6">
            <h2 className="font-semibold mb-3">
              {job.name} <span className="text-xs font-normal text-neutral-500">{job.code}</span>
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-2">Line</th>
                  <th className="py-1 pr-2 text-right">Budget</th>
                  <th className="py-1 pr-2 text-right">Committed</th>
                  <th className="py-1 pr-2 text-right">Actual</th>
                  <th className="py-1 pr-2 text-right">Variance</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {lines.map((b) => {
                  const budget = toNum(b.budgetAmount);
                  const actual = toNum(b.actualAmount);
                  const variance = budget ? Math.round(((actual - budget) / budget) * 1000) / 10 : 0;
                  const over = actual > budget && budget > 0;
                  return (
                    <tr key={b.id} className="border-t border-neutral-100">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{b.category || b.description}</span>
                        <span className="block text-xs text-neutral-500">
                          {b.description}
                          {b.phase?.name ? ` · ${b.phase.name}` : ""}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(budget)}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        {currency(toNum(b.committedAmount))}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(actual)}</td>
                      <td
                        className={`py-2 pr-2 text-right whitespace-nowrap text-xs font-semibold ${over ? "text-red-600" : "text-emerald-700"}`}
                      >
                        {actual === 0 ? "—" : `${variance > 0 ? "+" : ""}${variance}%`}
                      </td>
                      <td className="py-2 whitespace-nowrap text-right">
                        <form action={updateBudgetActual} className="inline-flex items-center gap-1">
                          <input type="hidden" name="org" value={ctx.orgSlug} />
                          <input type="hidden" name="recordId" value={b.id} />
                          <input
                            type="number"
                            step="0.01"
                            name="actualAmount"
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
      {all.length === 0 && (
        <EmptyState
          title="No budget lines yet"
          hint="Budget lines drive variance tracking and the cashflow forecast."
          action={{ href: orgPath(ctx.orgSlug, "/budget/new"), label: "+ New budget line" }}
        />
      )}
    </div>
  );
}
