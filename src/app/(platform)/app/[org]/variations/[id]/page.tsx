// Variation detail — approve (optionally editing the AI's numbers, which
// emits corrections into the learning loop) or reject.

import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate } from "@/lib/format";
import { loadVariationDetail } from "@/lib/platform/variationDetailSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { approveVariationAction, rejectVariationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function VariationDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const vo = await loadVariationDetail(ctx, id);
  if (!vo) notFound();

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={`${vo.refNumber || `VO #${vo.id}`} — ${vo.title}`}
        subtitle={`${vo.jobCode ? `${vo.jobCode} · ` : ""}submitted by ${vo.submittedBy || "—"}${vo.isAiDrafted ? " · AI drafted" : ""}`}
        actions={[{ href: orgPath(ctx.orgSlug, "/variations"), label: "All variations", variant: "outline" }]}
      />

      <div className="ae-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={vo.status} />
          {vo.approvedAt && (
            <span className="text-xs text-neutral-500">
              {vo.status} by {vo.approvedBy} on {formatDate(vo.approvedAt)}
            </span>
          )}
        </div>
        {vo.description && <p className="text-sm whitespace-pre-wrap">{vo.description}</p>}
        {vo.scopeChange && (
          <p className="text-sm">
            <span className="font-semibold">Scope change:</span> {vo.scopeChange}
          </p>
        )}
        <p className="text-sm">
          <span className="font-semibold">Cost impact:</span> {currency(vo.costImpact)}
          <span className="ml-4 font-semibold">Time impact:</span> {vo.timeImpactDays} days
        </p>

        {vo.status === "submitted" && (
          <div className="border-t border-neutral-100 pt-4">
            <form action={approveVariationAction} className="space-y-3">
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="recordId" value={vo.id} />
              <p className="text-xs text-neutral-500">
                Adjust the numbers before approving if needed — edits to an AI draft are recorded
                as corrections that feed the learning loop.
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <label className="block text-sm">
                  <span className="text-neutral-600">Final cost impact $</span>
                  <input type="number" step="0.01" name="costImpact" defaultValue={vo.costImpact} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
                </label>
                <label className="block text-sm">
                  <span className="text-neutral-600">Final time impact (days)</span>
                  <input type="number" name="timeImpactDays" defaultValue={vo.timeImpactDays} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
                </label>
              </div>
              <button type="submit" className="btn-ae">
                Approve variation
              </button>
            </form>
            <form action={rejectVariationAction} className="mt-2">
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="recordId" value={vo.id} />
              <button type="submit" className="btn-ae-outline text-red-600 border-red-300">
                Reject
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
