// Decisions (core tier) — confirmed knowledge; assistant drafts arrive as
// "proposed" with sourceType=chat and are confirmed or superseded here.

import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadDecisions } from "@/lib/platform/decisionsSource";
import { orgPath } from "@/lib/platform/paths";
import { setDecisionStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function DecisionsPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const decisions = await loadDecisions(ctx);

  return (
    <div className="p-6">
      <PageHeader
        title="Decisions"
        subtitle="Project decisions with rationale — proposed by people or the assistant, confirmed by you."
        actions={[{ href: orgPath(ctx.orgSlug, "/decisions/new"), label: "+ New decision" }]}
      />
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Decision</th>
              <th className="py-1 pr-2">By</th>
              <th className="py-1 pr-2">Source</th>
              <th className="py-1 pr-2">Date</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.id} className="border-t border-neutral-100 align-top">
                <td className="py-2 pr-2">
                  <span className="font-medium">{d.description}</span>
                  {d.jobCode && <span className="ml-1 text-xs text-neutral-400">{d.jobCode}</span>}
                  {d.rationale && (
                    <span className="block text-xs text-neutral-500">{d.rationale}</span>
                  )}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{d.madeBy || "—"}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs text-neutral-500">
                  {d.sourceType}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">
                  {formatDate(d.date)}
                </td>
                <td className="py-2 whitespace-nowrap">
                  <StatusBadge status={d.status} />
                  {d.status === "proposed" && (
                    <form action={setDecisionStatus} className="inline-flex gap-1 ml-2">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="recordId" value={d.id} />
                      <button name="status" value="confirmed" className="btn-ae text-xs">
                        Confirm
                      </button>
                      <button name="status" value="superseded" className="btn-ae-outline text-xs">
                        Supersede
                      </button>
                    </form>
                  )}
                  {d.status === "confirmed" && (
                    <form action={setDecisionStatus} className="inline ml-2">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="recordId" value={d.id} />
                      <button name="status" value="superseded" className="btn-ae-outline text-xs">
                        Supersede
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {decisions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6">
                  <EmptyState
                    title="No decisions yet"
                    hint="Record key decisions and their rationale so the project's reasoning stays traceable."
                    action={{ href: orgPath(ctx.orgSlug, "/decisions/new"), label: "+ New decision" }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
