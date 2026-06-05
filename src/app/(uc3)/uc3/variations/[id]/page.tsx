import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { approveVariation, rejectVariation } from "../../actions";

export const dynamic = "force-dynamic";

export default async function VariationDetailPage({
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

  let variation: Awaited<ReturnType<typeof db.uc3VariationOrder.findFirst>> = null;

  try {
    variation = await db.uc3VariationOrder.findFirst({
      where: { id: Number(id), tenantId },
      include: { project: { select: { id: true, name: true } } },
    });
  } catch {
    // graceful
  }

  if (!variation) notFound();

  const vo = variation as typeof variation & {
    project?: { id: number; name: string } | null;
  };

  const costNum = Number(vo.costImpact);
  const costFormatted =
    (costNum >= 0 ? "+" : "") +
    "$" +
    Math.abs(costNum).toLocaleString("en-AU", { maximumFractionDigits: 2 });

  const isPending = vo.status === "pending_approval";

  const approveWithId = approveVariation.bind(null, vo.id);
  const rejectWithId = rejectVariation.bind(null, vo.id);

  return (
    <div className="pb-16">
      <PageHeader
        title={`VO ${vo.refNumber}`}
        subtitle={vo.title}
        actions={[{ href: "/uc3/variations", label: "← All Variations" }]}
      />

      <div className="px-8 space-y-6 max-w-3xl">
        {/* Status banner for pending */}
        {isPending && (
          <div className="ae-card p-4 border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              This variation order is awaiting approval.
            </p>
          </div>
        )}

        {/* Main detail card */}
        <div className="ae-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              Variation Details
            </h2>
            <StatusBadge status={vo.status} />
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <dt className="text-neutral-500 mb-0.5">Reference</dt>
              <dd className="font-mono font-medium">{vo.refNumber}</dd>
            </div>

            <div>
              <dt className="text-neutral-500 mb-0.5">Project</dt>
              <dd>
                {vo.project ? (
                  <Link
                    href={`/uc3/projects/${vo.project.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {vo.project.name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>

            <div>
              <dt className="text-neutral-500 mb-0.5">Cost Impact</dt>
              <dd
                className={`font-semibold ${
                  costNum > 0
                    ? "text-red-600"
                    : costNum < 0
                    ? "text-green-600"
                    : "text-neutral-700"
                }`}
              >
                {costFormatted}
              </dd>
            </div>

            <div>
              <dt className="text-neutral-500 mb-0.5">Time Impact</dt>
              <dd>
                {vo.timeImpactDays != null ? `${vo.timeImpactDays} days` : "—"}
              </dd>
            </div>

            <div>
              <dt className="text-neutral-500 mb-0.5">Submitted By</dt>
              <dd>{vo.submittedBy ?? "—"}</dd>
            </div>

            <div>
              <dt className="text-neutral-500 mb-0.5">Created</dt>
              <dd>{formatDate(vo.createdAt)}</dd>
            </div>

            {vo.approvedBy && (
              <div>
                <dt className="text-neutral-500 mb-0.5">Approved / Rejected By</dt>
                <dd>{vo.approvedBy}</dd>
              </div>
            )}

            {vo.approvedAt && (
              <div>
                <dt className="text-neutral-500 mb-0.5">Decision Date</dt>
                <dd>{formatDate(vo.approvedAt)}</dd>
              </div>
            )}

            {vo.isAiDrafted && (
              <div className="sm:col-span-2">
                <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                  AI Drafted
                </span>
              </div>
            )}
          </dl>

          {vo.description && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">
                Description
              </p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                {vo.description}
              </p>
            </div>
          )}

          {vo.scopeChange && (
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">
                Scope Change
              </p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                {vo.scopeChange}
              </p>
            </div>
          )}
        </div>

        {/* Approval / Rejection form */}
        {isPending && (
          <div className="ae-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              Approval Decision
            </h2>

            <form className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="approvedBy"
                  className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="approvedBy"
                  name="approvedBy"
                  type="text"
                  required
                  placeholder="e.g. Jane Smith"
                  className="ae-input max-w-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="approvalNote"
                  className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Notes (optional)
                </label>
                <textarea
                  id="approvalNote"
                  name="approvalNote"
                  rows={2}
                  placeholder="Any comments on this decision…"
                  className="ae-input resize-none max-w-lg"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  formAction={approveWithId}
                  type="submit"
                  className="btn-ae"
                >
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
