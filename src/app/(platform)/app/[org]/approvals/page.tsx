// Approvals inbox — the human-in-the-loop gate for AI (and deferred manual)
// writes. Every proposal here is a PlatPendingWrite awaiting a decision; the
// same executeProposal/rejectProposal path the assistant uses backs the
// buttons, so approving here is identical to approving inline in chat.
//
// Each proposal renders a field-level diff: additions for a create, before→after
// for an update, a removal notice for a delete — so you approve a concrete change,
// not an opaque payload.

import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { isWritableTable, readRecord } from "@/lib/platform/recordWriter";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { approveProposalAction, rejectProposalAction } from "./actions";

export const dynamic = "force-dynamic";

const tableLabel = (key: string) => key.replace(/_/g, " ");
const opLabel = (op: string) => ({ create: "Create", update: "Update", delete: "Delete" })[op] ?? op;

// Storage/plumbing fields that are noise in a human review.
const SKIP_FIELDS = new Set(["context", "meta", "aiDraft", "aiAnalysis", "extractedActions", "jobId"]);

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

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}

const isEmpty = (v: unknown) =>
  v === "" ||
  v == null ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

interface Change {
  key: string;
  /** null = this field is a new addition (create / newly-set). */
  before: string | null;
  after: string;
}

/** Diff the proposed payload against the record's current state. */
function buildChanges(op: string, payload: string, current: Record<string, unknown> | null): Change[] {
  let proposed: Record<string, unknown>;
  try {
    proposed = JSON.parse(payload);
  } catch {
    return [{ key: "payload", before: null, after: fmt(payload) }];
  }
  const entries = Object.entries(proposed).filter(([k]) => !SKIP_FIELDS.has(k));

  if (op === "create") {
    return entries
      .filter(([, v]) => !isEmpty(v))
      .slice(0, 10)
      .map(([key, v]) => ({ key, before: null, after: fmt(v) }));
  }
  // update: surface only fields that actually change.
  const changes: Change[] = [];
  for (const [key, v] of entries) {
    const after = fmt(v);
    const before = current ? fmt(current[key]) : "—";
    if (after !== before) changes.push({ key, before, after });
  }
  return changes;
}

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);

  const all = await loadPendingWrites(ctx);
  const pending = all.filter((p) => p.status === "proposed");
  const recent = all
    .filter((p) => ["executed", "rejected", "expired", "failed"].includes(p.status))
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0))
    .slice(0, 8);

  // Resolve each proposal into a concrete diff (fetching the current row for
  // updates/deletes so we can show what actually changes).
  const proposals = await Promise.all(
    pending.map(async (prop) => {
      const current =
        prop.op !== "create" && prop.recordId && isWritableTable(prop.tableKey)
          ? await readRecord(ctx, prop.tableKey, prop.recordId)
          : null;
      return { prop, changes: buildChanges(prop.op, prop.payload, current) };
    }),
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Approvals"
        subtitle={`${ctx.config.assistant.name} can propose changes but never writes without you. Review and approve each one here.`}
      />

      {proposals.length === 0 ? (
        <div className="ae-card p-8 text-center">
          <div className="text-3xl mb-2">✓</div>
          <p className="font-semibold">You&apos;re all caught up</p>
          <p className="text-sm text-neutral-500 mt-1">
            Nothing is awaiting approval. Proposed changes will appear here for your review.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map(({ prop, changes }) => {
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
                        {prop.recordId ? <span className="text-neutral-400"> #{prop.recordId}</span> : null}
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

                {prop.op === "delete" ? (
                  <p className="mt-3 pt-3 border-t border-neutral-100 text-sm text-red-700">
                    Permanently deletes this {tableLabel(prop.tableKey)} record.
                  </p>
                ) : (
                  <dl className="mt-3 pt-3 border-t border-neutral-100 space-y-1.5 text-sm">
                    {changes.length === 0 && (
                      <p className="text-xs text-neutral-400">No effective change.</p>
                    )}
                    {changes.map((c) => (
                      <div key={c.key} className="flex flex-wrap items-baseline gap-x-2">
                        <dt className="text-[0.7rem] uppercase tracking-wide text-neutral-400 w-32 shrink-0">
                          {c.key}
                        </dt>
                        <dd className="min-w-0 text-neutral-700">
                          {c.before === null ? (
                            <span className="text-[var(--ae-success)]">{c.after}</span>
                          ) : (
                            <>
                              <span className="line-through text-neutral-400">{c.before}</span>
                              <span className="mx-1.5 text-neutral-300">→</span>
                              <span className="font-medium text-[var(--ae-space-deep)]">{c.after}</span>
                            </>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
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
