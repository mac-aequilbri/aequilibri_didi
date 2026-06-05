import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PhasesPage() {
  let phases: Awaited<ReturnType<typeof prisma.uc2ProjectPhase.findMany>> = [];

  try {
    phases = await prisma.uc2ProjectPhase.findMany({
      orderBy: { order: "asc" },
    });
  } catch {
    // empty state on error
  }

  const total = phases.length;
  const complete = phases.filter((p) => p.status === "complete").length;
  const inProgress = phases.filter((p) => p.status === "in_progress").length;
  const overallPct =
    total === 0
      ? 0
      : Math.round(
          phases.reduce((sum, p) => sum + p.completionPct, 0) / total
        );

  function statusLabel(status: string): string {
    return status
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return (
    <div>
      <PageHeader
        title="Project Phases"
        subtitle="Dulong Downs — phase schedule (read-only)"
      />

      <div className="px-8 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={total} label="Total Phases" />
          <MetricCard value={complete} label="Complete" />
          <MetricCard value={inProgress} label="In Progress" />
          <MetricCard value={`${overallPct}%`} label="Overall Progress" />
        </div>

        {/* Table */}
        <div className="ae-card overflow-x-auto">
          {phases.length === 0 ? (
            <p className="p-6 text-neutral-500 text-sm">No phases found.</p>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Phase</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Progress</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((phase) => (
                  <tr key={phase.id}>
                    <td className="text-neutral-400 text-sm">{phase.order}</td>
                    <td className="font-medium">{phase.name}</td>
                    <td>
                      <StatusBadge status={statusLabel(phase.status)} />
                    </td>
                    <td className="text-sm">{formatDate(phase.startDate)}</td>
                    <td className="text-sm">{formatDate(phase.endDate)}</td>
                    <td className="min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-neutral-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-ae-primary transition-all"
                            style={{ width: `${phase.completionPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-500 w-9 text-right">
                          {phase.completionPct}%
                        </span>
                      </div>
                    </td>
                    <td className="text-sm text-neutral-500 max-w-xs truncate">
                      {phase.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-neutral-400">
          Read-only view. Phase data is managed via the Django admin or seed
          scripts.
        </p>
      </div>
    </div>
  );
}
