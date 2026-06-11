import { prisma as db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { BimxViewer } from "@/components/BimxViewer";

export const dynamic = "force-dynamic";

// Public page — no auth cookie, no Sidebar wrapper

function ExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="ae-card p-10 max-w-md text-center space-y-4">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-bold text-neutral-800">
          Link Unavailable
        </h1>
        <p className="text-neutral-500 text-sm">
          This portal link has expired or been deactivated. Please contact your
          project manager for a new link.
        </p>
      </div>
    </div>
  );
}

export default async function PublicPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Load token record
  let tokenRecord: {
    id: number;
    isActive: boolean;
    expiresAt: Date | null;
    viewsCount: number;
    label: string | null;
    tenantId: number;
    projectId: number;
  } | null = null;

  try {
    tokenRecord = await db.uc3ClientPortalToken.findFirst({
      where: { token },
    });
  } catch {
    return <ExpiredPage />;
  }

  if (!tokenRecord) return <ExpiredPage />;
  if (!tokenRecord.isActive) return <ExpiredPage />;
  if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date())
    return <ExpiredPage />;

  // Increment view count (best-effort, no await needed for UX)
  db.uc3ClientPortalToken
    .update({
      where: { id: tokenRecord.id },
      data: { viewsCount: { increment: 1 } },
    })
    .catch(() => {});

  // Load project data
  let project: {
    id: number;
    name: string;
    client: string | null;
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
  }[] = [];

  let actionCounts: { open: number; inProgress: number; complete: number } = {
    open: 0,
    inProgress: 0,
    complete: 0,
  };

  let riskCounts: { open: number; mitigated: number } = {
    open: 0,
    mitigated: 0,
  };

  try {
    const { tenantId, projectId } = tokenRecord;

    [project, phases] = await Promise.all([
      db.uc3Project.findFirst({
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
      }),
      db.uc3Phase.findMany({
        where: { projectId, tenantId },
        orderBy: { order: "asc" },
        select: { id: true, name: true, status: true, completionPct: true, order: true },
      }),
    ]);

    const [actionAgg, riskAgg] = await Promise.all([
      db.uc3ActionItem.groupBy({
        by: ["status"],
        where: { projectId, tenantId },
        _count: { id: true },
      }),
      db.uc3Risk.groupBy({
        by: ["status"],
        where: { projectId, tenantId },
        _count: { id: true },
      }),
    ]);

    for (const row of actionAgg) {
      if (row.status === "open") actionCounts.open = row._count.id;
      else if (row.status === "in_progress") actionCounts.inProgress = row._count.id;
      else if (row.status === "complete") actionCounts.complete = row._count.id;
    }
    for (const row of riskAgg) {
      if (row.status === "open") riskCounts.open = row._count.id;
      else if (row.status === "mitigated") riskCounts.mitigated = row._count.id;
    }
  } catch {
    // graceful empty state
  }

  if (!project) return <ExpiredPage />;

  // Client-visible BIMx models only (internal-only models are never exposed here).
  let bimModels: { id: number; name: string; embedUrl: string }[] = [];
  try {
    bimModels = await db.uc3BimModel.findMany({
      where: { projectId: tokenRecord.projectId, tenantId: tokenRecord.tenantId, clientVisible: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, embedUrl: true },
    });
  } catch {
    // graceful empty state
  }

  const STATUS_LABEL: Record<string, string> = {
    planning: "Planning",
    active: "Active",
    on_hold: "On Hold",
    complete: "Complete",
  };

  const STATUS_COLOR: Record<string, string> = {
    planning: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    on_hold: "bg-yellow-100 text-yellow-700",
    complete: "bg-neutral-100 text-neutral-600",
  };

  const overallPct =
    phases.length > 0
      ? Math.round(
          phases.reduce((s, p) => s + p.completionPct, 0) / phases.length
        )
      : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              Client Portal
            </span>
            <h1 className="text-xl font-bold text-neutral-900 mt-0.5">
              {project.name}
            </h1>
            {project.client && (
              <p className="text-sm text-neutral-500">{project.client}</p>
            )}
          </div>
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full ${
              STATUS_COLOR[project.status] ?? "bg-neutral-100 text-neutral-600"
            }`}
          >
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Summary metrics */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400 mb-3">
            Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="ae-card p-4 text-center">
              <div className="text-2xl font-bold text-neutral-800">
                {overallPct}%
              </div>
              <div className="text-xs text-neutral-500 mt-1">Overall Progress</div>
            </div>
            <div className="ae-card p-4 text-center">
              <div className="text-2xl font-bold text-neutral-800">
                {phases.length}
              </div>
              <div className="text-xs text-neutral-500 mt-1">Phases</div>
            </div>
            <div className="ae-card p-4 text-center">
              <div className="text-2xl font-bold text-neutral-800">
                {actionCounts.open + actionCounts.inProgress}
              </div>
              <div className="text-xs text-neutral-500 mt-1">Open Actions</div>
            </div>
            <div className="ae-card p-4 text-center">
              <div className="text-2xl font-bold text-neutral-800">
                {riskCounts.open}
              </div>
              <div className="text-xs text-neutral-500 mt-1">Open Risks</div>
            </div>
          </div>
        </section>

        {/* Dates */}
        {(project.startDate || project.endDate) && (
          <section className="ae-card p-5">
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">
              Schedule
            </h2>
            <div className="flex flex-wrap gap-6 text-sm">
              {project.startDate && (
                <div>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide">
                    Start
                  </span>
                  <p className="font-medium text-neutral-800 mt-0.5">
                    {formatDate(project.startDate)}
                  </p>
                </div>
              )}
              {project.endDate && (
                <div>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide">
                    Planned Completion
                  </span>
                  <p className="font-medium text-neutral-800 mt-0.5">
                    {formatDate(project.endDate)}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Phases */}
        {phases.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400 mb-3">
              Phases
            </h2>
            <div className="space-y-3">
              {phases.map((phase) => {
                const pct = Math.max(0, Math.min(100, phase.completionPct));
                return (
                  <div key={phase.id} className="ae-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-neutral-800 text-sm">
                        {phase.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500 capitalize">
                          {phase.status.replace("_", " ")}
                        </span>
                        <span className="text-xs font-semibold text-neutral-700">
                          {pct}%
                        </span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-neutral-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 3D models (client-visible only) */}
        {bimModels.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400 mb-3">
              3D Model
            </h2>
            <div className="space-y-6">
              {bimModels.map((m) => (
                <div key={m.id}>
                  <p className="text-sm font-medium text-neutral-700 mb-2">{m.name}</p>
                  <BimxViewer src={m.embedUrl} title={m.name} height={520} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Action items summary (no financial data) */}
        <section className="ae-card p-5">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">
            Action Items Summary
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="text-xl font-bold text-amber-600">
                {actionCounts.open}
              </div>
              <div className="text-xs text-neutral-500 mt-1">Open</div>
            </div>
            <div>
              <div className="text-xl font-bold text-blue-600">
                {actionCounts.inProgress}
              </div>
              <div className="text-xs text-neutral-500 mt-1">In Progress</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">
                {actionCounts.complete}
              </div>
              <div className="text-xs text-neutral-500 mt-1">Complete</div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-neutral-400 pt-4">
          This is a read-only project status view. No financial data is
          included. Powered by Aequilibri.
        </footer>
      </main>
    </div>
  );
}
