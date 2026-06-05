import { prisma } from "@/lib/db";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { currency, toNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  let rows: Awaited<ReturnType<typeof prisma.uc2Budget.findMany<{ include: { category: true } }>>> = [];

  try {
    rows = await prisma.uc2Budget.findMany({
      include: { category: true },
      orderBy: [{ phase: "asc" }, { id: "asc" }],
    });
  } catch {
    // empty state on error
  }

  // Compute totals
  let totalEstimated = 0;
  let totalActual = 0;
  let totalCommitted = 0;

  const enriched = rows.map((r) => {
    const estimated = toNum(r.estimated);
    const actual = toNum(r.actual);
    const committed = toNum(r.committed);
    const variance = actual - estimated;
    const variancePct = estimated !== 0 ? (variance / estimated) * 100 : 0;
    totalEstimated += estimated;
    totalActual += actual;
    totalCommitted += committed;
    return { ...r, estimated, actual, committed, variance, variancePct };
  });

  const totalVariance = totalActual - totalEstimated;
  const totalVariancePct =
    totalEstimated !== 0 ? (totalVariance / totalEstimated) * 100 : 0;

  function varianceClass(v: number) {
    if (v > 0) return "text-red-600 font-medium";
    if (v < 0) return "text-green-700 font-medium";
    return "text-neutral-500";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        subtitle="Estimated vs actual spend — Dulong Downs"
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard value={currency(totalEstimated)} label="Total Estimated" />
        <MetricCard value={currency(totalActual)} label="Total Actual" />
        <MetricCard value={currency(totalCommitted)} label="Total Committed" />
        <MetricCard
          value={
            <span className={varianceClass(totalVariance)}>
              {totalVariance >= 0 ? "+" : ""}
              {currency(totalVariance)}{" "}
              <span className="text-base font-normal">
                ({totalVariancePct >= 0 ? "+" : ""}
                {totalVariancePct.toFixed(1)}%)
              </span>
            </span>
          }
          label="Variance (Actual − Est.)"
        />
      </div>

      {/* Actuals note */}
      <div className="ae-card p-4 text-sm text-neutral-600 border-l-4 border-amber-400 bg-amber-50">
        <strong>Note:</strong> Actual figures are entered manually by the project
        accountant. They are not derived from invoices or procurement records and
        must not be overwritten by automated processes.
      </div>

      {/* Table */}
      {enriched.length === 0 ? (
        <div className="ae-card text-center py-12 text-neutral-500">
          No budget lines found.
        </div>
      ) : (
        <div className="ae-card overflow-x-auto">
          <table className="ae-table w-full">
            <thead>
              <tr>
                <th>Category</th>
                <th>Phase</th>
                <th>Description</th>
                <th className="text-right">Estimated</th>
                <th className="text-right">Committed</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Var %</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    {row.category ? (
                      <span>
                        <span className="font-medium">{row.category.category}</span>
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="text-sm">{row.phase ?? <span className="text-neutral-400">—</span>}</td>
                  <td className="max-w-xs text-sm text-neutral-700">
                    {row.description ?? <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="text-right tabular-nums">{currency(row.estimated)}</td>
                  <td className="text-right tabular-nums text-neutral-600">{currency(row.committed)}</td>
                  <td className="text-right tabular-nums">{currency(row.actual)}</td>
                  <td className={`text-right tabular-nums ${varianceClass(row.variance)}`}>
                    {row.variance >= 0 ? "+" : ""}
                    {currency(row.variance)}
                  </td>
                  <td className={`text-right tabular-nums ${varianceClass(row.variancePct)}`}>
                    {row.variancePct >= 0 ? "+" : ""}
                    {row.variancePct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold border-t-2 border-neutral-300">
                <td colSpan={3} className="text-right text-sm pr-4">
                  Totals
                </td>
                <td className="text-right tabular-nums">{currency(totalEstimated)}</td>
                <td className="text-right tabular-nums">{currency(totalCommitted)}</td>
                <td className="text-right tabular-nums">{currency(totalActual)}</td>
                <td className={`text-right tabular-nums ${varianceClass(totalVariance)}`}>
                  {totalVariance >= 0 ? "+" : ""}
                  {currency(totalVariance)}
                </td>
                <td className={`text-right tabular-nums ${varianceClass(totalVariancePct)}`}>
                  {totalVariancePct >= 0 ? "+" : ""}
                  {totalVariancePct.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
