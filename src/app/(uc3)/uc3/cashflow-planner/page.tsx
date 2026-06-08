import Link from "next/link";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import { currency, toNum } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CashflowPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const tenantId = await getTenantId();

  if (!tenantId) {
    return (
      <div className="px-8 py-16 text-neutral-500 text-sm">
        No tenant selected.{" "}
        <Link href="/uc3/select-tenant" className="text-blue-600 underline">
          Select one
        </Link>
        .
      </div>
    );
  }

  const sp = await searchParams;
  const projectFilter = sp.project ? Number(sp.project) : undefined;

  let projects: { id: number; name: string }[] = [];
  let project: { id: number; name: string } | null = null;
  let cfData: { period: string; projected: number; actual: number; running: number }[] = [];
  let totalBudget = 0;
  let totalSpent = 0;
  let avgBurn = 0;

  try {
    projects = await db.uc3Project.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    project =
      (projectFilter && projects.find((p) => p.id === projectFilter)) ||
      projects[0] ||
      null;

    if (project) {
      const [cashflows, budgets] = await Promise.all([
        db.uc3Cashflow.findMany({
          where: { tenantId, projectId: project.id },
          orderBy: { period: "asc" },
        }),
        db.uc3Budget.findMany({ where: { tenantId, projectId: project.id } }),
      ]);

      totalBudget = budgets.reduce((s, b) => s + toNum(b.estimated), 0);
      totalSpent = budgets.reduce((s, b) => s + toNum(b.actual), 0);

      let running = 0;
      const actualVals: number[] = [];
      for (const cf of cashflows) {
        const projected = toNum(cf.projected);
        const actual = toNum(cf.actual);
        const monthSpend = actual !== 0 ? actual : projected;
        running += monthSpend;
        cfData.push({ period: cf.period, projected, actual, running });
        if (actual !== 0) actualVals.push(actual);
      }
      avgBurn = actualVals.length ? actualVals.reduce((s, v) => s + v, 0) / actualVals.length : 0;
    }
  } catch {
    // graceful empty state
  }

  const remaining = totalBudget - totalSpent;
  const monthsAt = (burn: number) => (burn > 0 ? Math.round((remaining / burn) * 10) / 10 : null);
  const scenarios = [
    { key: "optimistic", label: "Optimistic (−15%)", burn: avgBurn * 0.85 },
    { key: "base", label: "Base (current)", burn: avgBurn },
    { key: "pessimistic", label: "Pessimistic (+20%)", burn: avgBurn * 1.2 },
  ].map((s) => ({ ...s, months: monthsAt(s.burn) }));

  return (
    <div className="pb-16">
      <PageHeader
        title="Cashflow Planner"
        subtitle="Burn-rate scenarios and runway projection"
        actions={[{ href: "/uc3/cashflow", label: "Cashflow Ledger", variant: "outline" }]}
      />

      <div className="px-8 space-y-6">
        {/* Project picker */}
        <form className="flex items-center gap-3">
          <label className="text-sm text-neutral-600">Project</label>
          <select
            name="project"
            defaultValue={project?.id ?? ""}
            className="ae-input max-w-xs"
            // submit on change via native form behaviour
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit" className="btn-ae-outline text-xs">Apply</button>
        </form>

        {!project ? (
          <div className="ae-card p-8 text-center text-neutral-500 text-sm">No projects yet.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard value={currency(totalBudget)} label="Total Budget" />
              <MetricCard value={currency(totalSpent)} label="Spent to Date" />
              <MetricCard value={currency(remaining)} label="Remaining" />
              <MetricCard value={currency(avgBurn)} label="Avg Monthly Burn" />
            </div>

            {/* Scenarios */}
            <div className="ae-card p-6">
              <h2 className="text-base font-semibold mb-4">Runway Scenarios</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {scenarios.map((s) => (
                  <div key={s.key} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
                    <div className="text-sm font-medium text-neutral-600">{s.label}</div>
                    <div className="text-2xl font-bold mt-1">
                      {s.months != null ? `${s.months} mo` : "—"}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      at {currency(s.burn)}/mo
                    </div>
                  </div>
                ))}
              </div>
              {avgBurn === 0 && (
                <p className="text-xs text-neutral-500 mt-3">
                  No actual spend recorded yet — record cashflow actuals to project a runway.
                </p>
              )}
            </div>

            {/* Period ledger with running total */}
            <div className="ae-card overflow-hidden">
              <table className="ae-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="text-right">Projected</th>
                    <th className="text-right">Actual</th>
                    <th className="text-right">Running</th>
                  </tr>
                </thead>
                <tbody>
                  {cfData.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-neutral-500">No cashflow periods.</td></tr>
                  ) : (
                    cfData.map((cf) => (
                      <tr key={cf.period}>
                        <td>{cf.period}</td>
                        <td className="text-right">{currency(cf.projected)}</td>
                        <td className="text-right">{currency(cf.actual)}</td>
                        <td className="text-right font-medium">{currency(cf.running)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
