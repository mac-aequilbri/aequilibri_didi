import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { processMinutesAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewMinutesPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadJobOptions(ctx);

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title="New meeting minutes"
        subtitle="The AI extracts action items with owners and due dates for your confirmation."
      />
      <form action={processMinutesAction} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid grid-cols-2 gap-4">
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
            <span className="text-neutral-600">Meeting date</span>
            <input type="date" name="meetingDate" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Title</span>
            <input name="title" placeholder="Site coordination meeting #19" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Attendees</span>
            <input name="attendees" placeholder="PM, Foreman, Client Rep" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Raw minutes *</span>
          <textarea
            name="rawMinutes"
            required
            rows={10}
            placeholder="Paste the meeting transcript or notes here…"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <SubmitButton label="Extract actions with AI" pendingLabel="Extracting…" />
      </form>
    </div>
  );
}
