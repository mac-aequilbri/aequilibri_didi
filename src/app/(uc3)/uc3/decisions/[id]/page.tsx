import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { confirmDecision, supersedeDecision } from "../../actions";

export const dynamic = "force-dynamic";

export default async function DecisionDetailPage({
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

  let decision: Awaited<ReturnType<typeof db.uc3Decision.findFirst>> & {
    project?: { id: number; name: string } | null;
  } | null = null;

  try {
    decision = await db.uc3Decision.findFirst({
      where: { id: Number(id), tenantId },
      include: { project: { select: { id: true, name: true } } },
    });
  } catch {
    // graceful
  }

  if (!decision) notFound();

  const isDraft = decision.status === "draft";
  const confirmWithId = confirmDecision.bind(null, decision.id);
  const supersedeWithId = supersedeDecision.bind(null, decision.id);

  return (
    <div className="pb-16">
      <PageHeader
        title="Decision"
        subtitle={decision.project?.name}
        actions={[{ href: "/uc3/decisions", label: "← All Decisions", variant: "outline" }]}
      />

      <div className="px-8 space-y-6 max-w-3xl">
        {isDraft && (
          <div className="ae-card p-4 border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              This decision is a draft awaiting confirmation.
            </p>
          </div>
        )}

        <div className="ae-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              Details
            </h2>
            <StatusBadge status={decision.status} />
          </div>

          <div>
            <p className="text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Decision</p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
              {decision.description}
            </p>
          </div>

          {decision.rationale && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Rationale</p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                {decision.rationale}
              </p>
            </div>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <dt className="text-neutral-500 mb-0.5">Drafted by</dt>
              <dd>{decision.draftedBy || "—"}{decision.isAiDraft && " (AI)"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 mb-0.5">Created</dt>
              <dd>{formatDate(decision.createdAt)}</dd>
            </div>
            {decision.confirmedBy && (
              <div>
                <dt className="text-neutral-500 mb-0.5">Confirmed by</dt>
                <dd>{decision.confirmedBy}</dd>
              </div>
            )}
            {decision.confirmedAt && (
              <div>
                <dt className="text-neutral-500 mb-0.5">Confirmed at</dt>
                <dd>{formatDate(decision.confirmedAt)}</dd>
              </div>
            )}
          </dl>
        </div>

        {decision.status !== "superseded" && (
          <div className="ae-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">Actions</h2>
            <form className="flex flex-col gap-4">
              {isDraft && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="confirmedBy" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Your Name
                  </label>
                  <input id="confirmedBy" name="confirmedBy" type="text" placeholder="e.g. Jane Smith" className="ae-input max-w-sm" />
                </div>
              )}
              <div className="flex gap-3 pt-1">
                {isDraft && (
                  <button formAction={confirmWithId} type="submit" className="btn-ae">
                    Confirm Decision
                  </button>
                )}
                <button
                  formAction={supersedeWithId}
                  type="submit"
                  className="btn-ae-outline text-red-600 border-red-300 hover:bg-red-50"
                >
                  Supersede
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
