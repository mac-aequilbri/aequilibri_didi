// Phases grouped by job, with the AI-draft approval gate inline.

import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { approvePhase, rejectPhase, setPhaseProgress } from "./actions";

export const dynamic = "force-dynamic";

export default async function PhasesPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { code: "asc" },
    include: { conPhases: { orderBy: { sortOrder: "asc" } } },
  });
  const drafts = jobs.flatMap((j) => j.conPhases.filter((p) => p.isAiDraft));

  return (
    <div className="p-6">
      <PageHeader
        title="Phases"
        subtitle="Lifecycle milestones per job; AI-suggested phases wait below until approved."
      />

      {drafts.length > 0 && (
        <section className="ae-card p-5 mb-6 border-amber-300">
          <h2 className="font-semibold mb-3">AI drafts awaiting approval ({drafts.length})</h2>
          {drafts.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm border-t border-neutral-100 py-2">
              <span className="flex-1">
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-neutral-500">
                  {jobs.find((j) => j.id === p.jobId)?.code}
                </span>
              </span>
              <form action={approvePhase}>
                <input type="hidden" name="org" value={ctx.orgSlug} />
                <input type="hidden" name="recordId" value={p.id} />
                <button className="btn-ae text-xs">Approve</button>
              </form>
              <form action={rejectPhase}>
                <input type="hidden" name="org" value={ctx.orgSlug} />
                <input type="hidden" name="recordId" value={p.id} />
                <button className="btn-ae-outline text-xs">Reject</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {jobs.map((job) => (
        <section key={job.id} className="ae-card p-5 mb-6">
          <h2 className="font-semibold mb-3">
            {job.name} <span className="text-xs font-normal text-neutral-500">{job.code}</span>
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {job.conPhases
                .filter((p) => !p.isAiDraft)
                .map((p) => (
                  <tr key={p.id} className="border-t border-neutral-100">
                    <td className="py-2 pr-2 font-medium">{p.name}</td>
                    <td className="py-2 pr-2 w-1/3">
                      <div className="h-2 rounded bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full rounded bg-[var(--ae-space,#1f2937)]"
                          style={{ width: `${p.completionPct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <form action={setPhaseProgress} className="flex items-center gap-1">
                        <input type="hidden" name="org" value={ctx.orgSlug} />
                        <input type="hidden" name="recordId" value={p.id} />
                        <input
                          type="number"
                          name="completionPct"
                          min={0}
                          max={100}
                          defaultValue={p.completionPct}
                          className="w-16 text-xs border border-neutral-200 rounded px-1 py-0.5"
                        />
                        <span className="text-xs text-neutral-400">%</span>
                        <button type="submit" className="btn-ae-outline text-xs">
                          Set
                        </button>
                      </form>
                    </td>
                    <td className="py-2 text-right">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              {job.conPhases.filter((p) => !p.isAiDraft).length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-500 text-sm">No phases.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
