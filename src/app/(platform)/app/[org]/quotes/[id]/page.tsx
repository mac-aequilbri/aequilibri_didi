// Quote detail — edit meta, add/edit/remove priced lines (totals recomputed
// server-side), move through the draft → sent → accepted/rejected lifecycle,
// and open the printable client view. Reads through loadQuoteDetail so the
// Postgres → Airtable swap is invisible; the id is numeric (Postgres) or a
// "rec…" id (Airtable) and the forms post it back to RecordId-aware actions.

import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/form/ConfirmSubmitButton";
import { SubmitButton } from "@/components/form/SubmitButton";
import { currency, formatDate } from "@/lib/format";
import { loadQuoteDetail } from "@/lib/platform/quoteDetailSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import {
  acceptProposalAction,
  addLineAction,
  removeLineAction,
  setStatusAction,
  updateLineAction,
  updateMetaAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const quote = await loadQuoteDetail(ctx, id);
  if (!quote) notFound();

  const slug = ctx.orgSlug;
  const locked = quote.status === "accepted" || quote.status === "rejected";
  // A proposal (UC1-style) is sourced from an assessment and has no project
  // yet; accepting it is what materializes the managed project.
  const isProposal = quote.assessmentId != null && quote.status !== "accepted";

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <PageHeader
        title={`${quote.refNumber} · ${quote.title}`}
        subtitle={
          isProposal
            ? "Proposal — awaiting client acceptance (no project created yet)"
            : `${quote.jobCode ? `${quote.jobCode} — ` : ""}${quote.jobName}`
        }
        actions={[
          { href: orgPath(slug, `/quotes/${quote.id}/print`), label: "Print / PDF", variant: "outline" },
          { href: orgPath(slug, "/quotes"), label: "Back to quotes", variant: "outline" },
        ]}
      />

      {/* Status + lifecycle */}
      <section className="ae-card p-5 mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={quote.status} />
        <span className="text-xs text-neutral-500">
          {quote.sentAt ? `Sent ${formatDate(quote.sentAt)}. ` : ""}
          {quote.decidedAt ? `Decided ${formatDate(quote.decidedAt)}.` : ""}
        </span>
        <div className="flex flex-wrap gap-2 ml-auto">
          {quote.status === "draft" && (
            <StatusButton org={slug} id={quote.id} status="sent" label="Mark as sent" />
          )}
          {/* Acceptance: a proposal materializes the managed project; an
              in-project quote (variation / re-quote) just records the decision. */}
          {isProposal && <AcceptProposalButton org={slug} id={quote.id} />}
          {quote.status === "sent" && !isProposal && (
            <StatusButton org={slug} id={quote.id} status="accepted" label="Mark accepted" />
          )}
          {quote.status === "sent" && (
            <StatusButton org={slug} id={quote.id} status="rejected" label="Mark rejected" outline />
          )}
          {locked && <StatusButton org={slug} id={quote.id} status="draft" label="Reopen as draft" outline />}
        </div>
      </section>

      {/* Meta */}
      <section className="ae-card p-5 mb-6">
        <h2 className="font-semibold text-sm mb-3">Details</h2>
        <form action={updateMetaAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input type="hidden" name="org" value={slug} />
          <input type="hidden" name="quoteId" value={quote.id} />
          <label className="block text-sm">
            <span className="text-neutral-600">Title</span>
            <input name="title" defaultValue={quote.title} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Client name</span>
            <input name="clientName" defaultValue={quote.clientName} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Valid until</span>
            <input
              type="date"
              name="validUntil"
              defaultValue={quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : ""}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">GST rate (%)</span>
            <input type="number" step="0.01" name="gstRate" defaultValue={quote.gstRate} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-neutral-600">Notes / terms</span>
            <textarea name="notes" rows={2} defaultValue={quote.notes} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton label="Save details" className="btn-ae-outline text-sm" />
          </div>
        </form>
      </section>

      {/* Lines */}
      <section className="ae-card p-5 mb-6">
        <h2 className="font-semibold text-sm mb-3">Line items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem]">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-2">Description</th>
                <th className="py-1 pr-2 w-20 text-right">Qty</th>
                <th className="py-1 pr-2 w-20">Unit</th>
                <th className="py-1 pr-2 w-28 text-right">Unit price</th>
                <th className="py-1 pr-2 w-28 text-right">Line total</th>
                <th className="py-1 w-16" />
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2" colSpan={6}>
                    <form action={updateLineAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="org" value={slug} />
                      <input type="hidden" name="quoteId" value={quote.id} />
                      <input type="hidden" name="lineId" value={l.id} />
                      <input name="description" defaultValue={l.description} className="flex-1 min-w-40 rounded border border-neutral-200 px-2 py-1" />
                      <input name="qty" type="number" step="0.01" defaultValue={l.qty} className="w-16 rounded border border-neutral-200 px-2 py-1 text-right" aria-label="Quantity" />
                      <input name="unit" defaultValue={l.unit} className="w-16 rounded border border-neutral-200 px-2 py-1" aria-label="Unit" />
                      <input name="unitPrice" type="number" step="0.01" defaultValue={l.unitPrice} className="w-24 rounded border border-neutral-200 px-2 py-1 text-right" aria-label="Unit price" />
                      <span className="w-24 text-right font-medium whitespace-nowrap">{currency(l.lineTotal)}</span>
                      <SubmitButton label="Save" className="btn-ae-outline text-xs" />
                    </form>
                  </td>
                </tr>
              ))}
              {quote.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-neutral-500 text-sm">No line items yet — add one below.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {quote.lines.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-neutral-500">Remove a line:</span>
            {quote.lines.map((l) => (
              <form key={`rm-${l.id}`} action={removeLineAction}>
                <input type="hidden" name="org" value={slug} />
                <input type="hidden" name="quoteId" value={quote.id} />
                <input type="hidden" name="lineId" value={l.id} />
                <button type="submit" className="text-xs text-neutral-400 hover:text-red-600 border border-neutral-200 rounded px-2 py-0.5">
                  ✕ {l.description.slice(0, 24)}
                </button>
              </form>
            ))}
          </div>
        )}

        {/* Add line */}
        <form action={addLineAction} className="flex flex-wrap items-end gap-2 mt-4 border-t border-neutral-100 pt-4">
          <input type="hidden" name="org" value={slug} />
          <input type="hidden" name="quoteId" value={quote.id} />
          <label className="text-xs flex-1 min-w-40">
            <span className="text-neutral-500">Description</span>
            <input name="description" required placeholder="Supply & install…" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5" />
          </label>
          <label className="text-xs">
            <span className="text-neutral-500">Qty</span>
            <input name="qty" type="number" step="0.01" defaultValue={1} className="mt-1 w-16 rounded border border-neutral-300 px-2 py-1.5 text-right" />
          </label>
          <label className="text-xs">
            <span className="text-neutral-500">Unit</span>
            <input name="unit" defaultValue="item" className="mt-1 w-16 rounded border border-neutral-300 px-2 py-1.5" />
          </label>
          <label className="text-xs">
            <span className="text-neutral-500">Unit price</span>
            <input name="unitPrice" type="number" step="0.01" defaultValue={0} className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1.5 text-right" />
          </label>
          <button type="submit" className="btn-ae text-sm">+ Add line</button>
        </form>
      </section>

      {/* Totals */}
      <section className="ae-card p-5 max-w-sm ml-auto">
        <div className="flex justify-between text-sm py-1">
          <span className="text-neutral-600">Subtotal</span>
          <span>{currency(quote.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm py-1">
          <span className="text-neutral-600">GST ({quote.gstRate}%)</span>
          <span>{currency(quote.gstAmount)}</span>
        </div>
        <div className="flex justify-between font-bold py-1 border-t border-neutral-200 mt-1">
          <span>Total (inc GST)</span>
          <span>{currency(quote.total)}</span>
        </div>
      </section>
    </div>
  );
}

function StatusButton({
  org,
  id,
  status,
  label,
  outline,
}: {
  org: string;
  id: string;
  status: string;
  label: string;
  outline?: boolean;
}) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="quoteId" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton
        label={label}
        pendingLabel="Updating…"
        className={`${outline ? "btn-ae-outline" : "btn-ae"} text-xs`}
      />
    </form>
  );
}

/** Accept a proposal on the client's behalf — this materializes the managed
 *  project and redirects to it. */
function AcceptProposalButton({ org, id }: { org: string; id: string }) {
  return (
    <form action={acceptProposalAction}>
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="quoteId" value={id} />
      <ConfirmSubmitButton
        label="Mark accepted (creates project)"
        confirmLabel="Confirm — creates a project"
        pendingLabel="Accepting…"
        className="btn-ae text-xs"
      />
    </form>
  );
}
