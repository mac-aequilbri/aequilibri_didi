import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { currency, toNum } from "@/lib/format";
import { PageHeader, MetricCard } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function Uc3BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; phaseId?: string }>;
}) {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get("uc3_tenant_id")?.value ?? "";
  const sp = await searchParams;
  const filterProjectId = sp.projectId ? Number(sp.projectId) : undefined;
  const filterPhaseId = sp.phaseId ? Number(sp.phaseId) : undefined;

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

  let rows: BudgetRow[] = [];
  let projects: { id: number; name: string }[] = [];
  let phases: { id: number; name: string }[] = [];

  try {
    [rows, projects, phases] = await Promise.all([
      prisma.uc3Budget.findMany({
        where: {
          tenantId: tenantId ? Number(tenantId) : undefined,
          ...(filterProjectId ? { projectId: filterProjectId } : {}),
          ...(filterPhaseId ? { phaseId: filterPhaseId } : {}),
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          description: true,
          estimated: true,
          actual: true,
          project: { select: { id: true, name: true } },
          phase: { select: { id: true, name: true } },
        },
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
      prisma.uc3Phase.findMany({
        where: { tenantId: tenantId ? Number(tenantId) : undefined },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
  } catch {
    rows = [];
  }

  const totalEstimated = rows.reduce((s, r) => s + toNum(r.estimated), 0);
  const totalActual = rows.reduce((s, r) => s + toNum(r.actual), 0);
  const totalVariance = totalActual - totalEstimated;
  const overBudgetCount = rows.filter((r) => toNum(r.variance) > 0).length;

  return (
    <div>
      <PageHeader
        title="Budget Lines"
        subtitle="Estimated vs actual spend across projects"
        actions={[{ href: "/uc3/budget/new", label: "+ Add Line" }]}
      />

      <div className="px-8 space-y-4">
        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={currency(totalEstimated)} label="Total Estimated" />
          <MetricCard value={currency(totalActual)} label="Total Actual" />
          <MetricCard
            value={
              <span className={totalVariance > 0 ? "text-red-600" : "text-emerald-600"}>
                {totalVariance > 0 ? "+" : ""}
                {currency(totalVariance)}
              </span>
            }
            label="Total Variance"
          />
          <MetricCard
            value={
              <span className={overBudgetCount > 0 ? "text-amber-600" : "text-emerald-600"}>
                {overBudgetCount}
              </span>
            }
            label="Lines Over Budget"
          />
        </div>

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
            <label className="text-xs text-neutral-500 font-medium">Phase</label>
            <select
              name="phaseId"
              defaultValue={filterPhaseId ?? ""}
              className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800 w-48"
            >
              <option value="">All phases</option>
              {phases.map((ph) => (
                <option key={ph.id} value={ph.id}>
                  {ph.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-ae">Apply</button>
          {(filterProjectId || filterPhaseId) && (
            <a href="/uc3/budget" className="btn-ae-outline">Clear</a>
          )}
        </form>

        {/* Table */}
        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Project</th>
                <th>Phase</th>
                <th className="text-right">Estimated</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Var %</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-neutral-500">
                    No budget lines found.{" "}
                    <a href="/uc3/budget/new" className="underline text-blue-600">
                      Add the first one.
                    </a>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const vPct = toNum(r.variancePct);
                  const isWarning = Math.abs(vPct) > 10;
                  const v = toNum(r.variance);
                  const varClass =
                    v > 0
                      ? "text-red-600 font-semibold"
                      : v < 0
                      ? "text-emerald-600 font-semibold"
                      : "text-neutral-500";

                  return (
                    <tr key={r.id}>
                      <td>{r.description}</td>
                      <td className="text-sm text-neutral-600 dark:text-neutral-400">
                        {r.project?.name ?? <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="text-sm text-neutral-600 dark:text-neutral-400">
                        {r.phase?.name ?? <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="text-right tabular-nums">{currency(r.estimated)}</td>
                      <td className="text-right tabular-nums">{currency(r.actual)}</td>
                      <td className={`text-right tabular-nums ${varClass}`}>
                        {v > 0 ? "+" : ""}
                        {currency(r.variance)}
                      </td>
                      <td className={`text-right tabular-nums whitespace-nowrap ${varClass}`}>
                        {isWarning && (
                          <span
                            title="Variance exceeds 10%"
                            className="mr-1 text-amber-500"
                            aria-label="Warning: variance over 10%"
                          >
                            ⚠
                          </span>
                        )}
                        {v > 0 ? "+" : ""}
                        {vPct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-neutral-400 pb-4">{rows.length} line{rows.length !== 1 ? "s" : ""} shown.</p>
      </div>
    </div>
  );
}
