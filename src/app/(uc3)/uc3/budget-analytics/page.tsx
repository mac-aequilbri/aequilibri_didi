import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { currency, toNum } from "@/lib/format";
import { PageHeader, MetricCard } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

type BudgetRow = {
  id: number;
  description: string;
  estimated: import("@prisma/client/runtime/library").Decimal;
  actual: import("@prisma/client/runtime/library").Decimal;
  variance: number;
  variancePct: number;
  project: { id: number; name: string } | null;
  phase: { id: number; name: string } | null;
};

export default async function BudgetAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get("uc3_tenant_id")?.value ?? "";
  const sp = await searchParams;
  const filterProjectId = sp.project ? Number(sp.project) : undefined;

  let rows: BudgetRow[] = [];
  let projects: { id: number; name: string }[] = [];

  try {
    [rows, projects] = await Promise.all([
      prisma.uc3Budget.findMany({
        where: {
          tenantId: tenantId ? Number(tenantId) : undefined,
          ...(filterProjectId ? { projectId: filterProjectId } : {}),
        },
        select: {
          id: true,
          description: true,
          estimated: true,
          actual: true,
          project: { select: { id: true, name: true } },
          phase: { select: { id: true, name: true } },
        },
        orderBy: { id: "asc" },
      }).then((rows) =>
        rows.map((r) => {
          const est = toNum(r.estimated);
          const act = toNum(r.actual);
          return {
            ...r,
            variance: act - est,
            variancePct: est > 0 ? ((act - est) / est) * 100 : 0,
          };
        })
      ) as unknown as BudgetRow[],
      prisma.uc3Project.findMany({
        where: { tenantId: tenantId ? Number(tenantId) : undefined },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
  } catch {
    rows = [];
    projects = [];
  }

  const totalEstimated = rows.reduce((s, r) => s + toNum(r.estimated), 0);
  const totalActual = rows.reduce((s, r) => s + toNum(r.actual), 0);
  const burnPct = totalEstimated > 0 ? (totalActual / totalEstimated) * 100 : 0;
  const burnPctClamped = Math.min(burnPct, 100);

  const overBudget = rows
    .filter((r) => toNum(r.variance) > 0)
    .sort((a, b) => toNum(b.variance) - toNum(a.variance))
    .slice(0, 5);

  const underBudget = rows
    .filter((r) => toNum(r.variance) < 0)
    .sort((a, b) => toNum(a.variance) - toNum(b.variance))
    .slice(0, 5);

  const burnBarColor =
    burnPct > 100
      ? "bg-red-500"
      : burnPct > 85
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div>
      <PageHeader
        title="Budget Analytics"
        subtitle="Burn rate and variance analysis across all budget lines"
        actions={[{ href: "/uc3/budget", label: "Budget Lines" }]}
      />

      <div className="px-8 space-y-6 pb-10">
        {/* Project filter */}
        <form method="GET" className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 font-medium">Filter by Project</label>
            <select
              name="project"
              defaultValue={filterProjectId ?? ""}
              className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800 w-52"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-ae">Apply</button>
          {filterProjectId && (
            <a href="/uc3/budget-analytics" className="btn-ae-outline">Clear</a>
          )}
        </form>

        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={currency(totalEstimated)} label="Total Estimated" />
          <MetricCard value={currency(totalActual)} label="Total Actual Spend" />
          <MetricCard
            value={
              <span className={burnPct > 100 ? "text-red-600" : burnPct > 85 ? "text-amber-600" : "text-emerald-600"}>
                {burnPct.toFixed(1)}%
              </span>
            }
            label="Burn Rate"
          />
          <MetricCard
            value={
              <span className={overBudget.length > 0 ? "text-red-600" : "text-emerald-600"}>
                {overBudget.length}
              </span>
            }
            label="Lines Over Budget"
          />
        </div>

        {/* Burn rate bar */}
        <div className="ae-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Budget Burn Rate</h2>
            <span className="text-sm font-mono text-neutral-600 dark:text-neutral-400">
              {currency(totalActual)} / {currency(totalEstimated)}
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-5 overflow-hidden">
            <div
              className={`h-5 rounded-full transition-all ${burnBarColor}`}
              style={{ width: `${burnPctClamped}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>0%</span>
            <span className="font-medium">
              {burnPct.toFixed(1)}% burned
              {burnPct > 100 && (
                <span className="ml-2 text-red-600 font-semibold">OVER BUDGET</span>
              )}
            </span>
            <span>100%</span>
          </div>
        </div>

        {/* Over / Under budget panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Over Budget Top 5 */}
          <div className="ae-card p-6 space-y-4">
            <h2 className="font-semibold text-sm text-red-600">
              Top Over Budget Lines
              <span className="ml-2 text-neutral-400 font-normal text-xs">(by variance)</span>
            </h2>
            {overBudget.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4 text-center">No lines over budget.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                    <th className="text-left pb-2 font-medium">Description</th>
                    <th className="text-left pb-2 font-medium">Project</th>
                    <th className="text-right pb-2 font-medium">Variance</th>
                    <th className="text-right pb-2 font-medium">Var %</th>
                  </tr>
                </thead>
                <tbody>
                  {overBudget.map((r) => {
                    const v = toNum(r.variance);
                    const vp = toNum(r.variancePct);
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                        <td className="py-2 pr-2 truncate max-w-[140px]" title={r.description}>
                          {r.description}
                        </td>
                        <td className="py-2 pr-2 text-neutral-500 text-xs">
                          {r.project?.name ?? "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-red-600 font-semibold whitespace-nowrap">
                          +{currency(v)}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums text-red-600 whitespace-nowrap">
                          +{vp.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Under Budget Top 5 */}
          <div className="ae-card p-6 space-y-4">
            <h2 className="font-semibold text-sm text-emerald-600">
              Top Under Budget Lines
              <span className="ml-2 text-neutral-400 font-normal text-xs">(most savings)</span>
            </h2>
            {underBudget.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4 text-center">No lines under budget.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                    <th className="text-left pb-2 font-medium">Description</th>
                    <th className="text-left pb-2 font-medium">Project</th>
                    <th className="text-right pb-2 font-medium">Variance</th>
                    <th className="text-right pb-2 font-medium">Var %</th>
                  </tr>
                </thead>
                <tbody>
                  {underBudget.map((r) => {
                    const v = toNum(r.variance);
                    const vp = toNum(r.variancePct);
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                        <td className="py-2 pr-2 truncate max-w-[140px]" title={r.description}>
                          {r.description}
                        </td>
                        <td className="py-2 pr-2 text-neutral-500 text-xs">
                          {r.project?.name ?? "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-emerald-600 font-semibold whitespace-nowrap">
                          {currency(v)}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums text-emerald-600 whitespace-nowrap">
                          {vp.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <p className="text-xs text-neutral-400">
          {rows.length} budget line{rows.length !== 1 ? "s" : ""} analysed.
        </p>
      </div>
    </div>
  );
}
