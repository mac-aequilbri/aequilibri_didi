// New quote — pick the job, then either start blank or pre-fill the lines
// from that job's assessment budget breakdown.

import { DateField } from "@/components/form/DateField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { createQuoteAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewQuotePage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadJobOptions(ctx);

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <PageHeader
        title="New quote"
        subtitle="Choose a job and start the quote — pre-fill from its budget to save typing."
        actions={[{ href: orgPath(ctx.orgSlug, "/quotes"), label: "Back to quotes", variant: "outline" }]}
      />

      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-500">Create a job first — run a New Assessment.</p>
      ) : (
        <form action={createQuoteAction} className="ae-card p-5 space-y-4">
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
            <select name="jobId" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Quote title *</span>
            <input
              name="title"
              required
              placeholder="Seaview Duplex — quotation"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-neutral-600">Client name</span>
              <input name="clientName" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
            </label>
            <DateField name="validUntil" label="Valid until" noPast />
          </div>
          <label className="block text-sm">
            <span className="text-neutral-600">Notes / terms</span>
            <textarea
              name="notes"
              rows={3}
              placeholder="Quote valid for 30 days. Excludes…"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="fromBudget" defaultChecked />
            <span>Pre-fill lines from the job&apos;s budget breakdown</span>
          </label>
          <SubmitButton label="Create quote" pendingLabel="Creating…" />
        </form>
      )}
    </div>
  );
}
