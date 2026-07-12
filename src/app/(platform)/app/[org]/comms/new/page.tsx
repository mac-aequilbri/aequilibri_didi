import { DateField } from "@/components/form/DateField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createComm } from "../actions";

export const dynamic = "force-dynamic";

const MESSAGE_TYPES = [
  "Decision Notification",
  "Status Update",
  "Action Required",
  "Approval Request",
  "Escalation",
];
const STAKEHOLDER_ROLES = ["Owner", "Builder", "Architect", "Broker", "Supplier", "Regulatory", "Other"];

export default async function NewCommPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadJobOptions(ctx);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New communication" subtitle="Who needs to be told what, by when." />
      <form action={createComm} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Topic *</span>
          <input name="topic" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Message type</span>
            <select name="messageType" defaultValue="Status Update" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {MESSAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Stakeholder role</span>
            <select name="stakeholderRole" defaultValue="Owner" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {STAKEHOLDER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Job</span>
            <select name="jobId" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="">— none —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <DateField name="dueDate" label="Due date" noPast />
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Sent by</span>
          <input name="sentBy" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Notes</span>
          <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <SubmitButton label="Add communication" pendingLabel="Adding…" />
      </form>
    </div>
  );
}
