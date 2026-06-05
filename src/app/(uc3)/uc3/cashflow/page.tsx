import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { currency, toNum } from "@/lib/format";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { updateCashflowActual } from "../actions";

export const dynamic = "force-dynamic";

export default async function Uc3CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; period?: string }>;
}) {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get("uc3_tenant_id")?.value ?? "";
  const sp = await searchParams;
  const filterProjectId = sp.projectId ? Number(sp.projectId) : undefined;
  const filterPeriod = sp.period?.trim() || undefined;

  type CashflowRow = {
    id: number;
    period: string;
    projected: import("@prisma/client/runtime/library").Decimal;
    actual: import("@prisma/client/runtime/library").Decimal;
    project: { id: number; name: string } | null;
  };

  let rows: CashflowRow[] = [];
  let projects: { id: number; name: string }[] = [];

  try {
    [rows, projects] = await Promise.all([
      prisma.uc3Cashflow.findMany({
        where: {
          tenantId: tenantId ? Number(tenantId) : undefined,
          ...(filterProjectId ? { projectId: filterProjectId } : {}),
          ...(filterPeriod ? { period: filterPeriod } : {}),
        },
        orderBy: [{ period: "asc" }, { id: "asc" }],
        select: {
          id: true,
          period: true,
          projected: true,
          actual: true,
          project: { select: { id: true, name: true } },
        },
      }) as unknown as CashflowRow[],
      prisma.uc3Project.findMany({
        where: { tenantId: tenantId ? Number(tenantId) : undefined },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
  } catch {
    rows = [];
  }

  const totalProjected = rows.reduce((s, r) => s + toNum(r.projected), 0);
  const totalActual = rows.reduce((s, r) => s + toNum(r.actual), 0);
  const awaitingActual = rows.filter((r) => toNum(r.actual) === 0).length;
  const variance = totalActual - totalProjected;

  return (
    <div>
      <PageHeader
        title="Cashflow"
        subtitle="Monthly projected vs actual cashflow across projects"
        actions={[{ href: "/uc3/cashflow/new", label: "+ Add Entry" }]}
      />

      <div className="px-8 space-y-4">
        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={currency(totalProjected)} label="Total Projected" />
          <MetricCard value={currency(totalActual)} label="Total Actual" />
          <MetricCard
            value={
              <span className={variance >= 0 ? "text-emerald-600" : "text-red-600"}>
                {variance >= 0 ? "+" : ""}
                {currency(variance)}
              </span>
            }
            label="Net Variance"
          />
          <MetricCard
            value={
              <span className={awaitingActual > 0 ? "text-amber-600" : "text-emerald-600"}>
                {awaitingActual}
              </span>
            }
            label="Awaiting Actual"
          />
        </div>

        {/* AI/human note */}
        <p className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded px-3 py-2">
          Projected figures are AI-assisted estimates entered at planning time. Actual figures are
          entered manually once the period closes. Rows with no actual yet show an inline input.
        </p>

        {/* Filters */}
        <form method="GET" className="ae-card p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 font-medium">Project</label>
            <select
              name="projectId"
              defaultValue={filterProjectId ?? ""}
              className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800 w-48"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 font-medium">Period (YYYY-MM)</label>
            <input
              name="period"
              type="month"
              defaultValue={filterPeriod ?? ""}
              className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800"
            />
          </div>
          <button type="submit" className="btn-ae">
            Apply
          </button>
          {(filterProjectId || filterPeriod) && (
            <a href="/uc3/cashflow" className="btn-ae-outline">
              Clear
            </a>
          )}
        </form>

        {/* Table */}
        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Project</th>
                <th className="text-right">Projected</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Variance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-neutral-500">
                    No cashflow entries found.{" "}
                    <a href="/uc3/cashflow/new" className="underline text-blue-600">
                      Add the first one.
                    </a>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const proj = toNum(r.projected);
                  const act = toNum(r.actual);
                  const isActualMissing = act === 0;
                  const v = act - proj;
                  const varClass =
                    isActualMissing
                      ? "text-neutral-400"
                      : v >= 0
                      ? "text-emerald-600 font-semibold"
                      : "text-red-600 font-semibold";

                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-sm">{r.period}</td>
                      <td className="text-sm text-neutral-600 dark:text-neutral-400">
                        {r.project?.name ?? <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="text-right tabular-nums">{currency(r.projected)}</td>
                      <td className="text-right tabular-nums">
                        {isActualMissing ? (
                          <form action={updateCashflowActual} className="flex justify-end gap-2 items-center">
                            <input type="hidden" name="id" value={r.id} />
                            <input
                              name="actual"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              className="w-28 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 text-xs bg-white dark:bg-neutral-800 text-right"
                            />
                            <button type="submit" className="btn-ae text-xs px-2 py-1">
                              Save
                            </button>
                          </form>
                        ) : (
                          currency(r.actual)
                        )}
                      </td>
                      <td className={`text-right tabular-nums ${varClass}`}>
                        {isActualMissing ? (
                          <span className="text-neutral-400 text-xs">pending</span>
                        ) : (
                          <>
                            {v >= 0 ? "+" : ""}
                            {currency(v)}
                          </>
                        )}
                      </td>
                      <td className="text-right">
                        {isActualMissing && (
                          <span className="inline-block text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded px-2 py-0.5">
                            Needs actual
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-neutral-400 pb-4">
          {rows.length} entr{rows.length !== 1 ? "ies" : "y"} shown.
        </p>
      </div>
    </div>
  );
}
