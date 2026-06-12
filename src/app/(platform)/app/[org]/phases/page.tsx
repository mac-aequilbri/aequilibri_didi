// Phases grouped by job, with the AI-draft approval gate inline. Site
// evidence (photos/documents) attaches per phase; the AI review suggests a
// completion % from it, and a human approves/adjusts/dismisses the suggestion.

import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { parseSuggestion } from "@/services/platform/construction/phaseEvidence";
import {
  applyEvidenceSuggestionAction,
  approvePhase,
  assessPhaseEvidenceAction,
  dismissEvidenceSuggestionAction,
  rejectPhase,
  setPhaseProgress,
  uploadPhaseEvidenceAction,
} from "./actions";
import { PendingButton } from "./PendingButton";

export const dynamic = "force-dynamic";

export default async function PhasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { err } = await searchParams;
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { code: "asc" },
    include: {
      conPhases: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { evidence: true } } },
      },
    },
  });
  const drafts = jobs.flatMap((j) => j.conPhases.filter((p) => p.isAiDraft));

  return (
    <div className="p-6">
      <PageHeader
        title="Phases"
        subtitle="Lifecycle milestones per job; AI-suggested phases wait below until approved. Attach site evidence to a phase and the AI suggests a completion % — you decide whether it sticks."
      />

      {err && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {err}
        </p>
      )}

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
                .map((p) => {
                  const suggestion = parseSuggestion(p.evidenceSuggestion);
                  return [
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
                      <td className="py-2 pr-2">
                        <details className="relative">
                          <summary className="cursor-pointer btn-ae-outline text-xs whitespace-nowrap list-none">
                            Evidence{p._count.evidence > 0 ? ` (${p._count.evidence})` : ""}
                          </summary>
                          <div className="mt-2 space-y-2 border border-neutral-200 rounded p-2 bg-neutral-50">
                            <form
                              action={uploadPhaseEvidenceAction}
                              className="flex items-center gap-1 flex-wrap"
                            >
                              <input type="hidden" name="org" value={ctx.orgSlug} />
                              <input type="hidden" name="phaseId" value={p.id} />
                              <input
                                type="file"
                                name="file"
                                required
                                accept="image/*,video/*,application/pdf,.doc,.docx,.txt,.md"
                                className="text-xs max-w-44"
                              />
                              <PendingButton pendingLabel="Uploading…" outline>
                                Attach
                              </PendingButton>
                            </form>
                            {p._count.evidence > 0 && (
                              <form action={assessPhaseEvidenceAction}>
                                <input type="hidden" name="org" value={ctx.orgSlug} />
                                <input type="hidden" name="phaseId" value={p.id} />
                                <PendingButton pendingLabel="Reviewing evidence…">
                                  AI review → suggest %
                                </PendingButton>
                              </form>
                            )}
                            <p className="text-xs text-neutral-500">
                              Photos & documents are analysed; videos are stored as evidence
                              only. Max 5 MB per file.
                            </p>
                          </div>
                        </details>
                      </td>
                      <td className="py-2 text-right">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>,
                    suggestion && (
                      <tr key={`${p.id}-suggestion`}>
                        <td colSpan={5} className="pb-3">
                          <div className="border border-amber-300 bg-amber-50 rounded p-3 text-sm">
                            <p className="font-semibold">
                              Evidence review suggests {suggestion.suggestedPct}%{" "}
                              <span className="font-normal text-xs text-neutral-600">
                                (confidence {suggestion.confidence} ·{" "}
                                {suggestion.imageCount} photo(s) of {suggestion.evidenceCount}{" "}
                                item(s)
                                {suggestion.demoMode ? " · demo mode" : ""}) — currently{" "}
                                {p.completionPct}%
                              </span>
                            </p>
                            {suggestion.rationale && (
                              <p className="text-xs mt-1">{suggestion.rationale}</p>
                            )}
                            {suggestion.observations.length > 0 && (
                              <ul className="text-xs mt-1 ml-4 list-disc">
                                {suggestion.observations.map((o, i) => (
                                  <li key={i}>{o}</li>
                                ))}
                              </ul>
                            )}
                            {suggestion.missingEvidence.length > 0 && (
                              <p className="text-xs text-amber-800 mt-1">
                                Would improve confidence: {suggestion.missingEvidence.join("; ")}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <form action={applyEvidenceSuggestionAction}>
                                <input type="hidden" name="org" value={ctx.orgSlug} />
                                <input type="hidden" name="phaseId" value={p.id} />
                                <input type="hidden" name="finalPct" value={suggestion.suggestedPct} />
                                <PendingButton pendingLabel="Applying…">
                                  Approve {suggestion.suggestedPct}%
                                </PendingButton>
                              </form>
                              <form
                                action={applyEvidenceSuggestionAction}
                                className="flex items-center gap-1"
                              >
                                <input type="hidden" name="org" value={ctx.orgSlug} />
                                <input type="hidden" name="phaseId" value={p.id} />
                                <input
                                  type="number"
                                  name="finalPct"
                                  min={0}
                                  max={100}
                                  defaultValue={suggestion.suggestedPct}
                                  className="w-16 text-xs border border-neutral-300 rounded px-1 py-0.5"
                                />
                                <PendingButton pendingLabel="Applying…" outline>
                                  Apply adjusted
                                </PendingButton>
                              </form>
                              <form action={dismissEvidenceSuggestionAction}>
                                <input type="hidden" name="org" value={ctx.orgSlug} />
                                <input type="hidden" name="phaseId" value={p.id} />
                                <PendingButton pendingLabel="Dismissing…" outline>
                                  Dismiss
                                </PendingButton>
                              </form>
                            </div>
                            <p className="text-xs text-neutral-500 mt-2">
                              The AI never changes progress itself — your decision applies it.
                              Adjustments and dismissals are recorded as corrections for the
                              learning loop.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
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
