import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectPlanPage() {
  let phases: {
    id: number;
    name: string;
    status: string;
    order: number;
    tasks: {
      id: number;
      task: string;
      owner: string;
      startDate: Date | null;
      endDate: Date | null;
      status: string;
      pctComplete: number;
      notes: string | null;
    }[];
  }[] = [];

  try {
    const plans = await prisma.uc2ProjectPlan.findMany({
      include: { phase: true },
      orderBy: [{ phase: { order: "asc" } }, { startDate: "asc" }],
    });

    const phaseMap = new Map<
      number,
      (typeof phases)[number]
    >();

    for (const plan of plans) {
      if (!plan.phase) continue;
      if (!phaseMap.has(plan.phase.id)) {
        phaseMap.set(plan.phase.id, {
          id: plan.phase.id,
          name: plan.phase.name,
          status: plan.phase.status,
          order: plan.phase.order,
          tasks: [],
        });
      }
      phaseMap.get(plan.phase.id)!.tasks.push({
        id: plan.id,
        task: plan.task,
        owner: plan.owner,
        startDate: plan.startDate,
        endDate: plan.endDate,
        status: plan.status,
        pctComplete: plan.pctComplete,
        notes: plan.notes,
      });
    }

    phases = Array.from(phaseMap.values()).sort((a, b) => a.order - b.order);
  } catch {
    // empty state on error
  }

  return (
    <div>
      <PageHeader
        title="Project Plan"
        subtitle="Dulong Downs — tasks grouped by phase"
      />
      <div className="px-8 space-y-6 pb-10">
        {phases.length === 0 && (
          <div className="ae-card p-6 text-neutral-500 text-sm">
            No project plan data available.
          </div>
        )}
        {phases.map((phase) => (
          <div key={phase.id} className="ae-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-base font-semibold text-neutral-800">
                {phase.name}
              </h2>
              <StatusBadge status={phase.status} />
            </div>
            {phase.tasks.length === 0 ? (
              <p className="px-6 py-4 text-sm text-neutral-400">
                No tasks in this phase.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="ae-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Task</th>
                      <th className="text-left">Owner</th>
                      <th className="text-left">Start</th>
                      <th className="text-left">End</th>
                      <th className="text-left">Status</th>
                      <th className="text-left">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phase.tasks.map((t) => (
                      <tr key={t.id}>
                        <td className="font-medium text-neutral-800">
                          {t.task}
                          {t.notes && (
                            <p className="text-xs text-neutral-400 mt-0.5">
                              {t.notes}
                            </p>
                          )}
                        </td>
                        <td className="text-neutral-600">{t.owner}</td>
                        <td className="text-neutral-500 whitespace-nowrap">
                          {t.startDate ? formatDate(t.startDate) : "—"}
                        </td>
                        <td className="text-neutral-500 whitespace-nowrap">
                          {t.endDate ? formatDate(t.endDate) : "—"}
                        </td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-teal-500 rounded-full transition-all"
                                style={{ width: `${t.pctComplete}%` }}
                              />
                            </div>
                            <span className="text-xs text-neutral-500 w-8 text-right">
                              {t.pctComplete}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
