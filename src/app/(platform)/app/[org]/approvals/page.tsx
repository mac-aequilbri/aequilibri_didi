// Approvals inbox — the human-in-the-loop gate for AI (and deferred manual)
// writes. Every proposal here is a PlatPendingWrite awaiting a decision; the
// same executeProposal/rejectProposal path the assistant uses backs the
// buttons, so approving here is identical to approving inline in chat.
//
// Each proposal renders a field-level diff: additions for a create, before→after
// for an update, a removal notice for a delete — so you approve a concrete change,
// not an opaque payload.

import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/form/ConfirmSubmitButton";
import { SubmitButton } from "@/components/form/SubmitButton";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { isWritableTable, readRecord } from "@/lib/platform/recordWriter";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { canApprove } from "@/lib/platform/roles";
import { friendlyTableLabel } from "@/lib/platform/tableLabels";
import { approveProposalAction, rejectProposalAction } from "./actions";
import { ProposalFields } from "./ProposalFields";

export const dynamic = "force-dynamic";

const tableLabel = friendlyTableLabel;
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

// Post-approval "View record" links: logical write-registry key → list route
// with a /[id] detail page. Only registers with a real detail route are
// mapped; anything else simply omits the link (no extra reads either way).
const DETAIL_ROUTES: Record<string, string> = {
  job: "projects",
  action: "actions",
  decision: "decisions",
  document: "documents",
  phase: "phases",
  budget_line: "budget",
  cashflow: "cashflow",
  risk: "risks",
  variation_order: "variations",
  vendor: "vendors",
  procurement: "procurement",
  room: "room-matrix",
  meeting_minutes: "meeting-minutes",
  comms: "comms",
  quote: "quotes",
};

function detailHref(orgSlug: string, tableKey: string, recordId: string): string | null {
  const seg = DETAIL_ROUTES[tableKey];
  return seg && recordId ? `/app/${orgSlug}/${seg}/${encodeURIComponent(recordId)}` : null;
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
  /** Raw string form of the proposed value when the field is a scalar the
   *  reviewer may correct before approving (Spec 12 Module 2). */
  raw: string | null;
}

const rawIfEditable = (v: unknown): string | null =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : null;

/** Diff the proposed payload against the record's current state. */
function buildChanges(op: string, payload: string, current: Record<string, unknown> | null): Change[] {
  let proposed: Record<string, unknown>;
  try {
    proposed = JSON.parse(payload);
  } catch {
    return [{ key: "payload", before: null, after: fmt(payload), raw: null }];
  }
  const entries = Object.entries(proposed).filter(([k]) => !SKIP_FIELDS.has(k));

  if (op === "create") {
    return entries
      .filter(([, v]) => !isEmpty(v))
      .slice(0, 10)
      .map(([key, v]) => ({ key, before: null, after: fmt(v), raw: rawIfEditable(v) }));
  }
  // update: surface only fields that actually change.
  const changes: Change[] = [];
  for (const [key, v] of entries) {
    const after = fmt(v);
    const before = current ? fmt(current[key]) : "—";
    if (after !== before) changes.push({ key, before, after, raw: rawIfEditable(v) });
  }
  return changes;
}

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const sp = await searchParams;

  // Governance §2.2: only show proposals the viewer's role may resolve —
  // financial diffs (amounts, payees) must not render for non-finance roles.
  const viewer = await getCurrentViewer(ctx);
  const all = (await loadPendingWrites(ctx)).filter((p) => canApprove(viewer.role, p.tableKey));
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

      {typeof sp.approved === "string" && sp.approved !== "" && (
        <div role="status" className="ae-card p-3 mb-4 border-green-300 text-sm text-green-700">
          Change approved and written.
          {(() => {
            const href =
              typeof sp.t === "string" && typeof sp.r === "string"
                ? detailHref(ctx.orgSlug, sp.t, sp.r)
                : null;
            return href ? (
              <>
                {" "}
                <Link href={href} className="underline font-medium">
                  View record
                </Link>
              </>
            ) : null;
          })()}
        </div>
      )}

      {sp.error === "approve_failed" && (
        <div role="alert" className="ae-card p-3 mb-4 border-red-300 text-sm text-red-700">
          The approved write could not be executed — no change was made. The proposal is marked
          failed below; it may have expired or the record may have changed.
        </div>
      )}

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
            const editable = prop.op !== "delete" && changes.some((c) => c.raw !== null);
            return (
              // One form per card: Approve submits it (with any corrected
              // field values); Reject overrides via formAction. Correcting a
              // value before approving emits a CORRECTIONS record (Spec 12
              // Module 2 — propose, review/correct, confirm).
              <form key={prop.id} action={approveProposalAction} className="ae-card p-4">
                {/* Disabled default button: blocks implicit (Enter-key) submission,
                    which would otherwise fire Approve while typing a corrected
                    value or a reject reason. Approve/Reject require a click. */}
                <button type="submit" disabled hidden aria-hidden tabIndex={-1} />
                <input type="hidden" name="org" value={ctx.orgSlug} />
                <input type="hidden" name="proposalId" value={prop.id} />
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
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <SubmitButton label="Approve" pendingLabel="Approving…" className="btn-ae text-sm" />
                    <input
                      name="reason"
                      placeholder="Reason (optional)"
                      aria-label="Reject reason (optional)"
                      className="w-40 rounded border border-neutral-200 px-2 py-1 text-sm focus:border-neutral-400 focus:outline-none"
                    />
                    <ConfirmSubmitButton
                      label="Reject"
                      confirmLabel="Confirm reject"
                      pendingLabel="Rejecting…"
                      className="btn-ae-outline text-sm"
                      formAction={rejectProposalAction}
                    />
                  </div>
                </div>

                {prop.op === "delete" ? (
                  <p className="mt-3 pt-3 border-t border-neutral-100 text-sm text-red-700">
                    Permanently deletes this {tableLabel(prop.tableKey)} record.
                  </p>
                ) : (
                  // Client child: renders the field diff (input names unchanged)
                  // and reveals the root-cause block only once the reviewer has
                  // actually changed a field value.
                  <ProposalFields changes={changes} editable={editable} />
                )}
              </form>
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
