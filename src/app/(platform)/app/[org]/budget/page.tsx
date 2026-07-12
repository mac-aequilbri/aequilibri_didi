// Budget per job: Estimated / Forecast / Actual / Variance. Actual is derived
// from confirmed PROCUREMENT (Invoiced/Paid), not hand-entered.

import Link from "next/link";
import { BarsCompare } from "@/components/charts";
import { EmptyState, MetricCard, PageHeader } from "@/components/PageHeader";
import { currency, toNum } from "@/lib/format";
import { requireFinancialAccess, requireOrgCtx } from "@/lib/platform/org-context";
import { loadBudgetJobs } from "@/lib/platform/budgetSource";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  await requireFinancialAccess(ctx);
  const jobs = await loadBudgetJobs(ctx);

  const all = jobs.flatMap((j) => j.conBudgets);
  const totBudget = all.reduce((s, b) => s + toNum(b.budgetAmount), 0);
  const totForecast = all.reduce((s, b) => s + toNum(b.forecast), 0);
  const totActual = all.reduce((s, b) => s + toNum(b.actualAmount), 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Budget"
        subtitle="Estimated vs forecast vs actual. Actual is derived from confirmed procurement (Invoiced/Paid), not hand-entered."
        actions={[{ href: orgPath(ctx.orgSlug, "/budget/new"), label: "+ New line" }]}
      />
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <MetricCard value={currency(totBudget)} label="Estimated" />
        <MetricCard value={currency(totForecast)} label="Forecast" />
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
                  <th className="py-1 pr-2 text-right">Estimated</th>
                  <th className="py-1 pr-2 text-right">Forecast</th>
                  <th className="py-1 pr-2 text-right">Actual</th>
                  <th className="py-1 pr-2 text-right">Variance</th>
                  <th className="py-1 pr-2 text-right">RAG</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((b) => {
                  const estimated = toNum(b.budgetAmount);
                  const actual = toNum(b.actualAmount);
                  const variance = toNum(b.variance); // Forecast − Estimated
                  const over = variance > 0;
                  return (
                    <tr key={b.id} className="border-t border-neutral-100">
                      <td className="py-2 pr-2">
                        <Link
                          href={orgPath(ctx.orgSlug, `/budget/${b.id}`)}
                          className="font-medium hover:text-[var(--ae-space)] hover:underline"
                        >
                          {b.category || b.description}
                        </Link>
                        {(b.description || b.phaseName) && (
                          <span className="block text-xs text-neutral-500">
                            {b.description}
                            {b.phaseName ? ` · ${b.phaseName}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(estimated)}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(toNum(b.forecast))}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(actual)}</td>
                      <td
                        className={`py-2 pr-2 text-right whitespace-nowrap text-xs font-semibold ${over ? "text-red-600" : "text-emerald-700"}`}
                      >
                        {variance === 0 ? "—" : `${variance > 0 ? "+" : ""}${currency(variance)}`}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap text-xs">{b.rag || "—"}</td>
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
