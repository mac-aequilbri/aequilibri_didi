// Approvals inbox — the human-in-the-loop gate for AI (and deferred manual)
// writes. Every proposal here is a PlatPendingWrite awaiting a decision; the
// same executeProposal/rejectProposal path the assistant uses backs the
// buttons, so approving here is identical to approving inline in chat.

import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { approveProposalAction, rejectProposalAction } from "./actions";

export const dynamic = "force-dynamic";

const tableLabel = (key: string) => key.replace(/_/g, " ");
const opLabel = (op: string) => ({ create: "Create", update: "Update", delete: "Delete" })[op] ?? op;

function timeAgo(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function expiryNote(expiresAt: Date): { text: string; soon: boolean } {
  const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return { text: "expires today", soon: true };
  if (days === 1) return { text: "expires tomorrow", soon: true };
  return { text: `expires in ${days} days`, soon: days <= 2 };
}

/** Pull a few human-readable fields out of the stored JSON payload. */
function summarise(payload: string): { key: string; value: string }[] {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(payload);
  } catch {
    return [{ key: "payload", value: payload.slice(0, 120) }];
  }
  return Object.entries(obj)
    .filter(([, v]) => v !== "" && v != null && !(typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0))
    .slice(0, 6)
    .map(([key, v]) => ({
      key,
      value: String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 90),
    }));
}

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);

  const [pending, recent] = await Promise.all([
    prisma.platPendingWrite.findMany({
      where: { orgId: ctx.orgId, status: "proposed" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.platPendingWrite.findMany({
      where: { orgId: ctx.orgId, status: { in: ["executed", "rejected", "expired", "failed"] } },
      orderBy: { resolvedAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="p-6">
      <PageHeader
        title="Approvals"
        subtitle={`${ctx.config.assistant.name} can propose changes but never writes without you. Review and approve each one here.`}
      />

      {pending.length === 0 ? (
        <div className="ae-card p-8 text-center">
          <div className="text-3xl mb-2">✓</div>
          <p className="font-semibold">You&apos;re all caught up</p>
          <p className="text-sm text-neutral-500 mt-1">
            Nothing is awaiting approval. Proposed changes will appear here for your review.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((prop) => {
            const exp = expiryNote(prop.expiresAt);
            const isAi = prop.actorType === "ai";
            return (
              <div key={prop.id} className="ae-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full ${
                          isAi ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {isAi ? "AI" : "Manual"}
                      </span>
                      <span className="font-semibold">
                        {opLabel(prop.op)} {tableLabel(prop.tableKey)}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {prop.actorName || (isAi ? ctx.config.assistant.name : "—")} · {timeAgo(prop.createdAt)}
                      {" · "}
                      <span className={exp.soon ? "text-red-600 font-medium" : ""}>{exp.text}</span>
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <form action={approveProposalAction}>
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="proposalId" value={prop.id} />
                      <button type="submit" className="btn-ae text-sm">
                        Approve
                      </button>
                    </form>
                    <form action={rejectProposalAction}>
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="proposalId" value={prop.id} />
                      <button type="submit" className="btn-ae-outline text-sm">
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
                <dl className="mt-3 pt-3 border-t border-neutral-100 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
                  {summarise(prop.payload).map(({ key, value }) => (
                    <div key={key} className="flex gap-2 min-w-0">
                      <dt className="text-neutral-400 shrink-0">{key}</dt>
                      <dd className="text-neutral-700 truncate">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <section className="ae-card p-5 mt-8">
          <h2 className="font-semibold mb-3 text-sm text-neutral-500 uppercase tracking-wide">
            Recently resolved
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {recent.map((prop) => (
                <tr key={prop.id} className="border-t border-neutral-100">
                  <td className="py-2 pr-2">
                    <span className="font-medium">
                      {opLabel(prop.op)} {tableLabel(prop.tableKey)}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {prop.resolvedBy ? `${prop.resolvedBy} · ` : ""}
                      {prop.resolvedAt ? timeAgo(prop.resolvedAt) : ""}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <StatusBadge status={prop.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
