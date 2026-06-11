import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { getTenantId } from "@/lib/uc3-tenant";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ── Risk heatmap helpers ──────────────────────────────────────────────────────

const LIKELIHOOD_LABELS = ["", "Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const IMPACT_LABELS = ["", "Negligible", "Minor", "Moderate", "Major", "Catastrophic"];

function heatmapColor(l: number, i: number): string {
  const score = l * i;
  if (score >= 16) return "bg-red-600 text-white";
  if (score >= 9) return "bg-orange-400 text-white";
  if (score >= 4) return "bg-yellow-300 text-neutral-800";
  return "bg-green-200 text-neutral-700";
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  const tenantId = await getTenantId();

  if (!tenantId || isNaN(projectId)) notFound();

  let project: {
    id: number;
    name: string;
    client: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    healthScore: number | null;
  } | null = null;

  let phases: {
    id: number;
    name: string;
    status: string;
    completionPct: number;
    order: number;
    isAiDraft: boolean;
    approvedBy: string | null;
  }[] = [];

  let risks: {
    id: number;
    description: string;
    likelihood: number;
    impact: number;
    status: string;
    owner: string | null;
  }[] = [];

  let recentActions: {
    id: number;
    title: string;
    status: string;
    priority: string;
    owner: string | null;
    dueDate: Date | null;
  }[] = [];

  let openRisksCount = 0;
  let openActionsCount = 0;
  let totalPhases = 0;

  try {
    project = await db.uc3Project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        name: true,
        client: true,
        status: true,
        startDate: true,
        endDate: true,
        healthScore: true,
      },
    });

    if (!project) notFound();

    [phases, risks, recentActions] = await Promise.all([
      db.uc3Phase.findMany({
        where: { projectId, tenantId },
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          completionPct: true,
          order: true,
          isAiDraft: true,
          approvedBy: true,
        },
      }),
      db.uc3Risk.findMany({
        where: { projectId, tenantId },
        select: {
          id: true,
          description: true,
          likelihood: true,
          impact: true,
          status: true,
          owner: true,
        },
      }),
      db.uc3ActionItem.findMany({
        where: { projectId, tenantId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          owner: true,
          dueDate: true,
        },
      }),
    ]);

    openRisksCount = risks.filter((r) => r.status === "open").length;
    openActionsCount = recentActions.filter(
      (a) => a.status === "open" || a.status === "in_progress"
    ).length;
    totalPhases = phases.length;
  } catch {
    if (!project) notFound();
  }

  // Build 3x3 heatmap cells (likelihood 1-3, impact 1-3 for compact display; scale to 5)
  // We'll show a 5x5 heatmap and overlay dots for open risks
  const riskDots: Record<string, number> = {};
  for (const r of risks.filter((r) => r.status === "open")) {
    const key = `${r.likelihood}-${r.impact}`;
    riskDots[key] = (riskDots[key] ?? 0) + 1;
  }

  return (
    <div>
      <PageHeader
        title={project!.name}
        subtitle={`Client: ${project!.client}`}
        actions={[
          { href: `/uc3/projects/${projectId}/models`, label: "3D Models" },
          { href: `/uc3/projects/${projectId}/edit`, label: "Edit Project", variant: "outline" },
          { href: "/uc3/projects", label: "All Projects", variant: "outline" },
        ]}
      />

      <div className="px-8 pb-8 space-y-6">
        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={<StatusBadge status={project!.status} />} label="Status" />
          <MetricCard value={totalPhases} label="Phases" />
          <MetricCard value={openActionsCount} label="Open Actions" />
          <MetricCard
            value={
              project!.healthScore != null ? (
                <span
                  className={
                    project!.healthScore >= 70
                      ? "text-green-600"
                      : project!.healthScore >= 40
                      ? "text-yellow-600"
                      : "text-red-600"
                  }
                >
                  {project!.healthScore}
                </span>
              ) : (
                "—"
              )
            }
            label="Health Score"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Phases table */}
          <div className="ae-card overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <h2 className="font-semibold text-sm">Phases</h2>
              <span className="text-xs text-neutral-500">{totalPhases} total</span>
            </div>
            {phases.length === 0 ? (
              <div className="p-5 text-neutral-500 text-sm">No phases yet.</div>
            ) : (
              <table className="ae-table w-full">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Phase</th>
                    <th>Status</th>
                    <th>Completion</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map((ph) => (
                    <tr key={ph.id}>
                      <td className="text-neutral-400 text-xs">{ph.order}</td>
                      <td className="font-medium text-sm">
                        {ph.name}
                        {ph.isAiDraft && (
                          <span className="ml-1 text-xs text-violet-500">(AI)</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={ph.status} />
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${ph.completionPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-neutral-500">{ph.completionPct}%</span>
                        </div>
                      </td>
                      <td className="text-xs text-neutral-500">{ph.approvedBy ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Risk heatmap */}
          <div className="ae-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Risk Heatmap</h2>
              <span className="text-xs text-neutral-500">
                {openRisksCount} open risk{openRisksCount !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="overflow-auto">
              <table className="text-xs border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="text-left text-neutral-400 pr-2 pb-1 font-normal">
                      L \ I
                    </th>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <th key={i} className="text-center font-normal text-neutral-400 w-14">
                        {IMPACT_LABELS[i].slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[5, 4, 3, 2, 1].map((l) => (
                    <tr key={l}>
                      <td className="text-right pr-2 text-neutral-400 whitespace-nowrap">
                        {LIKELIHOOD_LABELS[l].slice(0, 4)}
                      </td>
                      {[1, 2, 3, 4, 5].map((i) => {
                        const key = `${l}-${i}`;
                        const count = riskDots[key] ?? 0;
                        return (
                          <td
                            key={i}
                            className={`rounded text-center w-14 h-8 ${heatmapColor(l, i)}`}
                          >
                            {count > 0 && (
                              <span className="font-bold">{count}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-neutral-400 mt-2">Numbers = open risk count per cell</p>
          </div>
        </div>

        {/* Recent actions */}
        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
            <h2 className="font-semibold text-sm">Recent Action Items</h2>
            <Link href="/uc3/actions" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {recentActions.length === 0 ? (
            <div className="p-5 text-neutral-500 text-sm">No action items yet.</div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {recentActions.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium text-sm">{a.title}</td>
                    <td>
                      <span
                        className={`text-xs font-medium ${
                          a.priority === "critical"
                            ? "text-red-600"
                            : a.priority === "high"
                            ? "text-orange-600"
                            : a.priority === "medium"
                            ? "text-yellow-700"
                            : "text-neutral-500"
                        }`}
                      >
                        {a.priority}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="text-sm text-neutral-500">{a.owner ?? "—"}</td>
                    <td className="text-sm text-neutral-500">
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Project metadata */}
        <div className="ae-card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-neutral-400 mb-1">Start Date</div>
            <div>{project!.startDate ? formatDate(project!.startDate) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">End Date</div>
            <div>{project!.endDate ? formatDate(project!.endDate) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">Total Risks</div>
            <div>{risks.length}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">Open Risks</div>
            <div className={openRisksCount > 0 ? "text-orange-600 font-semibold" : ""}>
              {openRisksCount}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
