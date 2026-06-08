import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { approvePhase, rejectPhase } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function PhaseReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  let phase: Awaited<ReturnType<typeof db.uc3Phase.findFirst>> & {
    project?: { id: number; name: string } | null;
  } | null = null;

  try {
    phase = await db.uc3Phase.findFirst({
      where: { id: Number(id), tenantId },
      include: { project: { select: { id: true, name: true } } },
    });
  } catch {
    // graceful
  }

  if (!phase) notFound();

  const isDraft = phase.isAiDraft;
  const wasRejected = phase.approvedBy.startsWith("REJECTED:");
  const approveWithId = approvePhase.bind(null, phase.id);
  const rejectWithId = rejectPhase.bind(null, phase.id);

  return (
    <div className="pb-16">
      <PageHeader
        title={`Review Phase: ${phase.name}`}
        subtitle={phase.project?.name}
        actions={[{ href: "/uc3/phases/approvals", label: "← All Approvals", variant: "outline" }]}
      />

      <div className="px-8 space-y-6 max-w-3xl">
        {isDraft && (
          <div className="ae-card p-4 border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              This phase is an AI draft awaiting approval.
              {wasRejected && " It was previously rejected — see the note below."}
            </p>
          </div>
        )}

        <div className="ae-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              Phase Details
            </h2>
            <StatusBadge status={isDraft ? "draft" : "approved"} />
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <dt className="text-neutral-500 mb-0.5">Name</dt>
              <dd className="font-medium">{phase.name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 mb-0.5">Status</dt>
              <dd>{phase.status}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 mb-0.5">Order</dt>
              <dd>{phase.order}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 mb-0.5">Completion</dt>
              <dd>{phase.completionPct}%</dd>
            </div>
            <div>
              <dt className="text-neutral-500 mb-0.5">Start</dt>
              <dd>{formatDate(phase.startDate)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 mb-0.5">End</dt>
              <dd>{formatDate(phase.endDate)}</dd>
            </div>
            {phase.approvedBy && (
              <div className="sm:col-span-2">
                <dt className="text-neutral-500 mb-0.5">Reviewer note</dt>
                <dd className={wasRejected ? "text-red-600" : ""}>{phase.approvedBy}</dd>
              </div>
            )}
          </dl>
        </div>

        {isDraft && (
          <div className="ae-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              Approval Decision
            </h2>

            <form className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="approvedBy" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Your Name
                </label>
                <input
                  id="approvedBy"
                  name="approvedBy"
                  type="text"
                  placeholder="e.g. Jane Smith"
                  className="ae-input max-w-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="reason" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Rejection reason (if rejecting)
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  rows={2}
                  placeholder="Why is this phase being rejected…"
                  className="ae-input resize-none max-w-lg"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button formAction={approveWithId} type="submit" className="btn-ae">
                  Approve
                </button>
                <button
                  formAction={rejectWithId}
                  type="submit"
                  className="btn-ae-outline text-red-600 border-red-300 hover:bg-red-50"
                >
                  Reject
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
