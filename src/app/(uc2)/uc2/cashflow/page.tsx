import { prisma } from "@/lib/db";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { currency, toNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CashflowPage() {
  let rows: Awaited<ReturnType<typeof prisma.uc2Cashflow.findMany>> = [];

  try {
    rows = await prisma.uc2Cashflow.findMany({
      orderBy: { period: "asc" },
    });
  } catch {
    // empty state on error
  }

  // Derived metrics
  let totalProjected = 0;
  let totalActual = 0;
  let rowsWithVariance = 0;

  type EnrichedRow = (typeof rows)[number] & {
    variance: number | null;
    variancePct: number | null;
  };

  const enriched: EnrichedRow[] = rows.map((r) => {
    const proj = toNum(r.projected);
    const act = toNum(r.actual);
    totalProjected += proj;
    totalActual += act;

    let variance: number | null = null;
    let variancePct: number | null = null;

    if (act !== 0) {
      variance = act - proj;
      variancePct = proj !== 0 ? ((act - proj) / Math.abs(proj)) * 100 : null;
      rowsWithVariance++;
    }

    return { ...r, variance, variancePct };
  });

  const totalVariance = totalActual !== 0 ? totalActual - totalProjected : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Flow"
        subtitle="Dulong Downs — projected vs actual by period. Projections are Didi estimates only and do not constitute financial advice."
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-8">
        <MetricCard value={currency(totalProjected)} label="Total Projected" />
        <MetricCard value={currency(totalActual)} label="Total Actual" />
        <MetricCard
          value={
            totalVariance !== null ? (
              <span className={totalVariance >= 0 ? "text-red-600" : "text-green-700"}>
                {totalVariance >= 0 ? "+" : ""}
                {currency(totalVariance)}
              </span>
            ) : (
              <span className="text-neutral-400 text-base">No actuals yet</span>
            )
          }
          label="Total Variance (actual − proj)"
        />
        <MetricCard value={rows.length} label="Periods" />
      </div>

      {rows.length === 0 ? (
        <div className="ae-card mx-8 text-center py-12 text-neutral-500">
          No cash flow data found.
        </div>
      ) : (
        <div className="ae-card mx-8 overflow-x-auto">
          <p className="text-xs text-neutral-400 px-4 pt-3 pb-1 italic">
            Variance is only computed for periods where an actual figure has been recorded (actual ≠ 0).
          </p>
          <table className="ae-table w-full">
            <thead>
              <tr>
                <th>Period</th>
                <th className="text-right">Projected (AUD)</th>
                <th className="text-right">Actual (AUD)</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Variance %</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((row) => {
                const over = row.variance !== null && row.variance > 0;
                const under = row.variance !== null && row.variance < 0;
                return (
                  <tr key={row.id}>
                    <td className="font-medium whitespace-nowrap">{row.period}</td>
                    <td className="text-right tabular-nums">{currency(row.projected)}</td>
                    <td className="text-right tabular-nums">
                      {toNum(row.actual) === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        currency(row.actual)
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.variance === null ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <span className={over ? "text-red-600" : under ? "text-green-700" : ""}>
                          {row.variance >= 0 ? "+" : ""}
                          {currency(row.variance)}
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.variancePct === null ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <span className={over ? "text-red-600" : under ? "text-green-700" : ""}>
                          {row.variancePct >= 0 ? "+" : ""}
                          {row.variancePct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-neutral-500 max-w-xs">
                      {row.notes ?? <span className="text-neutral-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {enriched.length > 1 && (
              <tfoot>
                <tr className="font-semibold bg-neutral-50">
                  <td>Total</td>
                  <td className="text-right tabular-nums">{currency(totalProjected)}</td>
                  <td className="text-right tabular-nums">
                    {totalActual !== 0 ? currency(totalActual) : <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="text-right tabular-nums">
                    {totalVariance !== null ? (
                      <span className={totalVariance >= 0 ? "text-red-600" : "text-green-700"}>
                        {totalVariance >= 0 ? "+" : ""}
                        {currency(totalVariance)}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
