// Public client portal — unauthenticated by design. Access is granted solely
// by the token (64-char, unique, expirable, deactivatable); every query below
// is scoped to the token's org + job, never to a session. No financial data.

import { prisma, prismaUnscoped } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { BimxViewer } from "@/components/BimxViewer";

export const dynamic = "force-dynamic";

function ExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="ae-card p-10 max-w-md text-center space-y-4">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-bold text-neutral-800">Link Unavailable</h1>
        <p className="text-neutral-500 text-sm">
          This portal link has expired or been deactivated. Please contact your project manager
          for a new link.
        </p>
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  intake: "bg-blue-100 text-blue-700",
  assessment: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  on_hold: "bg-yellow-100 text-yellow-700",
  completed: "bg-neutral-100 text-neutral-600",
};

export default async function PublicPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 32) return <ExpiredPage />;

  // Deliberate cross-org lookup: the token itself is the credential, so this
  // is the one read that cannot be org-scoped (hence prismaUnscoped).
  const tokenRecord = await prismaUnscoped.platConPortalToken
    .findFirst({ where: { token } })
    .catch(() => null);
  if (!tokenRecord || !tokenRecord.isActive) return <ExpiredPage />;
  if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) return <ExpiredPage />;

  // Best-effort view counter.
  prisma.platConPortalToken
    .update({ where: { id: tokenRecord.id }, data: { viewsCount: { increment: 1 } } })
    .catch(() => {});

  const { orgId, jobId } = tokenRecord;
  const [job, phases, actionAgg, riskAgg, bimModels] = await Promise.all([
    prisma.platJob.findFirst({
      where: { id: jobId, orgId },
      select: {
        name: true,
        status: true,
        startDate: true,
        targetEndDate: true,
        clientContact: { select: { name: true } },
      },
    }),
    prisma.platConPhase.findMany({
      where: { jobId, orgId, isAiDraft: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, status: true, completionPct: true },
    }),
    prisma.platActionHub.groupBy({ by: ["status"], where: { jobId, orgId }, _count: { id: true } }),
    prisma.platConRisk.groupBy({ by: ["status"], where: { jobId, orgId }, _count: { id: true } }),
    prisma.platConBimModel.findMany({
      where: { jobId, orgId, clientVisible: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, embedUrl: true },
    }),
  ]).catch(() => [null, [], [], [], []] as const);

  if (!job) return <ExpiredPage />;

  const counts = { open: 0, inProgress: 0, done: 0 };
  for (const row of actionAgg ?? []) {
    if (row.status === "open") counts.open = row._count.id;
    else if (row.status === "in_progress") counts.inProgress = row._count.id;
    else if (row.status === "done") counts.done = row._count.id;
  }
  const openRisks = (riskAgg ?? []).find((r) => r.status === "open")?._count.id ?? 0;
  const overallPct = phases.length
    ? Math.round(phases.reduce((s, p) => s + p.completionPct, 0) / phases.length)
    : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              Client Portal
            </span>
            <h1 className="text-xl font-bold text-neutral-900 mt-0.5">{job.name}</h1>
            {job.clientContact?.name && (
              <p className="text-sm text-neutral-500">{job.clientContact.name}</p>
            )}
          </div>
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${STATUS_COLOR[job.status] ?? "bg-neutral-100 text-neutral-600"}`}
          >
            {job.status.replace("_", " ")}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400 mb-3">
            Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              [`${overallPct}%`, "Overall Progress"],
              [phases.length, "Phases"],
              [counts.open + counts.inProgress, "Open Actions"],
              [openRisks, "Open Risks"],
            ].map(([value, label]) => (
              <div key={String(label)} className="ae-card p-4 text-center">
                <div className="text-2xl font-bold text-neutral-800">{value}</div>
                <div className="text-xs text-neutral-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {(job.startDate || job.targetEndDate) && (
          <section className="ae-card p-5">
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">Schedule</h2>
            <div className="flex flex-wrap gap-6 text-sm">
              {job.startDate && (
                <div>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide">Start</span>
                  <p className="font-medium text-neutral-800 mt-0.5">{formatDate(job.startDate)}</p>
                </div>
              )}
              {job.targetEndDate && (
                <div>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide">
                    Planned Completion
                  </span>
                  <p className="font-medium text-neutral-800 mt-0.5">
                    {formatDate(job.targetEndDate)}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

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
                      <span className="font-medium text-neutral-800 text-sm">{phase.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-500 capitalize">
                          {phase.status.replace("_", " ")}
                        </span>
                        <span className="text-xs font-semibold text-neutral-700">{pct}%</span>
                      </div>
                    </div>
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

        <section className="ae-card p-5">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">Action Items Summary</h2>
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="text-xl font-bold text-amber-600">{counts.open}</div>
              <div className="text-xs text-neutral-500 mt-1">Open</div>
            </div>
            <div>
              <div className="text-xl font-bold text-blue-600">{counts.inProgress}</div>
              <div className="text-xs text-neutral-500 mt-1">In Progress</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">{counts.done}</div>
              <div className="text-xs text-neutral-500 mt-1">Complete</div>
            </div>
          </div>
        </section>

        <footer className="text-center text-xs text-neutral-400 pt-4">
          This is a read-only project status view. No financial data is included. Powered by
          æquilibri.
        </footer>
      </main>
    </div>
  );
}
