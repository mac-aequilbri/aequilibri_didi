import { prisma } from "@/lib/db";
import { currency, formatDate } from "@/lib/format";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function Uc2Dashboard() {
  let openActions = 0;
  let overdueCount = 0;
  let phases: {
    id: number;
    name: string;
    status: string;
    completionPct: number;
    startDate: Date | null;
    endDate: Date | null;
  }[] = [];
  let overallPct = 0;
  let totalEstimated = 0;
  let totalActual = 0;
  let activeRules = 0;
  let pendingHypotheses = 0;
  let recentChanges: {
    id: number;
    tableName: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string | null;
    timestamp: Date;
  }[] = [];

  try {
    // Auto-mark stale open/in-progress actions overdue on load (parity with the
    // Django dashboard). Scoped to past-due dates so it's idempotent day-to-day.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.uc2ActionHub.updateMany({
      where: { status: { in: ["open", "in_progress"] }, dueDate: { lt: today } },
      data: { status: "overdue" },
    });

    const [
      openActionsCount,
      overdueActionsCount,
      phasesData,
      budgets,
      activeRulesCount,
      pendingHypothesesCount,
      changes,
    ] = await Promise.all([
      prisma.uc2ActionHub.count({
        where: { status: { in: ["open", "overdue"] } },
      }),
      prisma.uc2ActionHub.count({
        where: { status: "overdue" },
      }),
      prisma.uc2ProjectPhase.findMany({
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          completionPct: true,
          startDate: true,
          endDate: true,
        },
      }),
      prisma.uc2Budget.findMany({
        select: { estimated: true, actual: true },
      }),
      prisma.uc2LearningRule.count({ where: { isActive: true } }),
      prisma.uc2Hypothesis.count({ where: { status: "pending" } }),
      prisma.uc2ChangeLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 5,
        select: {
          id: true,
          tableName: true,
          field: true,
          oldValue: true,
          newValue: true,
          changedBy: true,
          timestamp: true,
        },
      }),
    ]);

    openActions = openActionsCount;
    overdueCount = overdueActionsCount;
    phases = phasesData;
    overallPct =
      phasesData.length > 0
        ? Math.round(
            phasesData.reduce((sum, p) => sum + p.completionPct, 0) /
              phasesData.length
          )
        : 0;
    totalEstimated = budgets.reduce(
      (sum, b) => sum + Number(b.estimated.toString()),
      0
    );
    totalActual = budgets.reduce(
      (sum, b) => sum + Number(b.actual.toString()),
      0
    );
    activeRules = activeRulesCount;
    pendingHypotheses = pendingHypothesesCount;
    recentChanges = changes;
  } catch {
    // empty state on error — data remains at defaults
  }

  return (
    <div>
      <PageHeader
        title="Dulong Downs"
        subtitle="Didi AI Construction Coordinator"
        actions={[{ href: "/uc2/chat", label: "Chat with Didi" }]}
      />

      <div className="px-8 space-y-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard value={overallPct + "%"} label="Overall Progress" />
          <MetricCard value={openActions} label="Open Actions" />
          <MetricCard value={overdueCount} label="Overdue" />
          <MetricCard value={currency(totalEstimated)} label="Est. Budget" />
          <MetricCard value={activeRules} label="Active Rules" />
          <MetricCard value={pendingHypotheses} label="Pending Hypotheses" />
        </div>

        {/* Phases Table */}
        <div className="ae-card">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="text-base font-semibold">Project Phases</h2>
          </div>
          {phases.length === 0 ? (
            <p className="px-6 py-8 text-sm text-neutral-500">No phases found.</p>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Phase</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <StatusBadge status={p.status.replace("_", " ")} />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-neutral-100 rounded-full h-2 min-w-[80px]">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${p.completionPct}%` }}
                          />
                        </div>
                        <span className="text-sm tabular-nums w-9 text-right">
                          {p.completionPct}%
                        </span>
                      </div>
                    </td>
                    <td>{formatDate(p.startDate)}</td>
                    <td>{formatDate(p.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Changes */}
        <div className="ae-card">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="text-base font-semibold">Recent Changes</h2>
          </div>
          {recentChanges.length === 0 ? (
            <p className="px-6 py-8 text-sm text-neutral-500">No recent changes.</p>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Field</th>
                  <th>Change</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentChanges.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono text-xs">{c.tableName}</td>
                    <td>{c.field}</td>
                    <td>
                      <span className="text-neutral-400 line-through mr-1">
                        {c.oldValue ?? "—"}
                      </span>
                      <span className="text-neutral-800">{c.newValue ?? "—"}</span>
                    </td>
                    <td>{c.changedBy ?? "—"}</td>
                    <td>{formatDate(c.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
