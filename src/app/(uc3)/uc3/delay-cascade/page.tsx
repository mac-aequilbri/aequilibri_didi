import { cookies } from "next/headers";
import { prisma as db } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { analyzeDelayCascade } from "../actions";

export const dynamic = "force-dynamic";

export default async function DelayCascadePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; log?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const selectedProjectId = sp.project ? Number(sp.project) : null;
  const logId = sp.log ? Number(sp.log) : null;

  // ── Resolve tenant ───────────────────────────────────────────────────────────
  let tenantId: number | null = null;
  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;
    if (val) {
      tenantId = Number(val);
    } else {
      const fallback = await db.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }
  } catch {
    tenantId = null;
  }

  // ── Load projects list ───────────────────────────────────────────────────────
  type ProjectRow = { id: number; name: string; client: string | null; status: string };
  let projects: ProjectRow[] = [];
  try {
    if (tenantId) {
      projects = await db.uc3Project.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, client: true, status: true },
      });
    }
  } catch {
    projects = [];
  }

  // ── Load selected project data ───────────────────────────────────────────────
  type PhaseRow = {
    id: number;
    name: string;
    status: string;
    completionPct: number;
    order: number;
    isAiDraft: boolean;
  };
  type RiskRow = {
    id: number;
    description: string;
    likelihood: number;
    impact: number;
    status: string;
    owner: string | null;
  };

  let selectedProject: ProjectRow | null = null;
  let phases: PhaseRow[] = [];
  let openRisks: RiskRow[] = [];

  try {
    if (tenantId && selectedProjectId) {
      const [proj, phaseRows, riskRows] = await Promise.all([
        db.uc3Project.findFirst({
          where: { id: selectedProjectId, tenantId },
          select: { id: true, name: true, client: true, status: true },
        }),
        db.uc3Phase.findMany({
          where: { projectId: selectedProjectId, tenantId },
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            status: true,
            completionPct: true,
            order: true,
            isAiDraft: true,
          },
        }),
        db.uc3Risk.findMany({
          where: {
            projectId: selectedProjectId,
            tenantId,
            status: { in: ["open", "accepted"] },
          },
          orderBy: { id: "desc" },
          select: {
            id: true,
            description: true,
            likelihood: true,
            impact: true,
            status: true,
            owner: true,
          },
        }),
      ]);
      selectedProject = proj ?? null;
      phases = phaseRows as PhaseRow[];
      openRisks = riskRows as RiskRow[];
    }
  } catch {
    selectedProject = null;
    phases = [];
    openRisks = [];
  }

  // ── Load execution log result ─────────────────────────────────────────────────
  type LogRow = {
    id: number;
    toolName: string;
    status: string;
    result: string | null;
    payload: string | null;
    createdAt: Date;
  };
  let logRow: LogRow | null = null;
  try {
    if (tenantId && logId) {
      logRow = (await db.uc3ExecutionLog.findFirst({
        where: { id: logId, tenantId },
        select: {
          id: true,
          toolName: true,
          status: true,
          result: true,
          payload: true,
          createdAt: true,
        },
      })) as LogRow | null;
    }
  } catch {
    logRow = null;
  }

  const riskScore = (r: RiskRow) => r.likelihood * r.impact;

  return (
    <div className="pb-16">
      <PageHeader
        title="Delay Cascade Analysis"
        subtitle="Model the schedule impact of a delay trigger across project phases and risks"
      />

      <div className="px-8 space-y-6">
        {/* Error banner */}
        {sp.error && (
          <div className="ae-card p-4 border-l-4 border-red-400 bg-red-50 text-red-700 text-sm">
            {sp.error === "missing_fields"
              ? "Please provide both a delay description and the number of days."
              : sp.error}
          </div>
        )}

        {/* Project selector */}
        <div className="ae-card p-5">
          <h2 className="text-sm font-semibold text-neutral-600 mb-3">Select Project</h2>
          <form method="GET" className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500 font-medium" htmlFor="project-select">
                Project
              </label>
              <select
                id="project-select"
                name="project"
                defaultValue={selectedProjectId ?? ""}
                className="border border-neutral-300 rounded px-3 py-1.5 text-sm bg-white w-72 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">— choose a project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.client ? ` — ${p.client}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-ae self-end">
              Load
            </button>
          </form>
          {projects.length === 0 && (
            <p className="mt-3 text-sm text-neutral-400">No projects found for this tenant.</p>
          )}
        </div>

        {/* Project loaded: phases table */}
        {selectedProject && (
          <>
            <div className="ae-card overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-3">
                <h2 className="text-sm font-semibold text-neutral-700 flex-1">
                  {selectedProject.name}
                  {selectedProject.client && (
                    <span className="ml-2 text-neutral-400 font-normal">
                      — {selectedProject.client}
                    </span>
                  )}
                </h2>
                <StatusBadge status={selectedProject.status} />
              </div>

              {phases.length === 0 ? (
                <div className="p-5 text-sm text-neutral-400">No phases defined for this project.</div>
              ) : (
                <table className="ae-table w-full">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Phase</th>
                      <th>Status</th>
                      <th>Completion</th>
                      <th>AI Draft</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phases.map((ph) => (
                      <tr key={ph.id}>
                        <td className="text-neutral-400 text-xs">{ph.order}</td>
                        <td className="font-medium text-sm">{ph.name}</td>
                        <td>
                          <StatusBadge status={ph.status} />
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-blue-500 h-1.5 rounded-full"
                                style={{ width: `${ph.completionPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-neutral-500">{ph.completionPct}%</span>
                          </div>
                        </td>
                        <td className="text-xs text-neutral-400">
                          {ph.isAiDraft ? (
                            <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs">
                              AI
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Open risks summary */}
            {openRisks.length > 0 && (
              <div className="ae-card overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-100">
                  <h2 className="text-sm font-semibold text-neutral-700">
                    Open / Accepted Risks ({openRisks.length})
                  </h2>
                </div>
                <table className="ae-table w-full">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Owner</th>
                      <th>Likelihood</th>
                      <th>Impact</th>
                      <th>Score</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openRisks.map((r) => (
                      <tr key={r.id}>
                        <td className="text-sm max-w-xs">{r.description}</td>
                        <td className="text-sm text-neutral-500">{r.owner ?? "—"}</td>
                        <td className="text-sm">{r.likelihood}</td>
                        <td className="text-sm">{r.impact}</td>
                        <td>
                          <span
                            className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                              riskScore(r) >= 15
                                ? "bg-red-100 text-red-700"
                                : riskScore(r) >= 8
                                ? "bg-amber-100 text-amber-700"
                                : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {riskScore(r)}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Delay analysis form */}
            <div className="ae-card p-5">
              <h2 className="text-sm font-semibold text-neutral-700 mb-4">
                Run Delay Cascade Analysis
              </h2>
              <form action={analyzeDelayCascade} className="space-y-4">
                <input type="hidden" name="projectId" value={selectedProject.id} />

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="delayTrigger"
                    className="text-xs font-medium text-neutral-600"
                  >
                    Delay trigger description
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <textarea
                    id="delayTrigger"
                    name="delayTrigger"
                    rows={3}
                    placeholder="e.g. Wet weather has halted slab pour on Phase 2 — site inaccessible for equipment"
                    className="border border-neutral-300 rounded px-3 py-2 text-sm bg-white w-full max-w-2xl focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="delayDays"
                    className="text-xs font-medium text-neutral-600"
                  >
                    Estimated delay duration (days)
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <input
                    id="delayDays"
                    name="delayDays"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="e.g. 14"
                    className="border border-neutral-300 rounded px-3 py-1.5 text-sm bg-white w-32 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    required
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button type="submit" className="btn-ae">
                    Analyse Cascade
                  </button>
                  <span className="text-xs text-neutral-400">
                    AI authority: approval required — result is advisory only
                  </span>
                </div>
              </form>
            </div>
          </>
        )}

        {/* Execution log result */}
        {logRow && (
          <div className="ae-card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-neutral-700 flex-1">
                Analysis Result
              </h2>
              <StatusBadge status={logRow.status} />
              <span className="text-xs text-neutral-400">
                Log #{logRow.id}
              </span>
            </div>

            {logRow.payload && (
              <details className="text-xs text-neutral-400">
                <summary className="cursor-pointer hover:text-neutral-600 select-none">
                  Show input parameters
                </summary>
                <pre className="mt-1 p-2 bg-neutral-50 border border-neutral-200 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(logRow.payload!), null, 2);
                    } catch {
                      return logRow.payload;
                    }
                  })()}
                </pre>
              </details>
            )}

            <pre className="p-4 bg-neutral-50 border border-neutral-200 rounded text-sm whitespace-pre-wrap break-words leading-relaxed">
              {logRow.result ?? "No result content recorded."}
            </pre>

            <div className="flex gap-3 pt-1">
              <a
                href={`/uc3/delay-cascade?project=${selectedProjectId ?? ""}`}
                className="btn-ae-outline text-sm"
              >
                Run another analysis
              </a>
              <a href="/uc3/exec-log" className="btn-ae-outline text-sm">
                View execution log
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
