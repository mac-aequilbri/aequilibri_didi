import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createActionItem } from "../actions";
import { DueDateField } from "./DueDateField";
import { SubmitButton } from "./SubmitButton";

export const dynamic = "force-dynamic";

export default async function NewActionPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadJobOptions(ctx);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New action" />
      <form action={createActionItem} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Title *</span>
          <input name="title" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Detail</span>
          <textarea name="detail" rows={3} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job</span>
            <select name="jobId" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="">—</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Priority</span>
            <select name="priority" defaultValue="P2" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="P1">P1 — urgent</option>
              <option value="P2">P2 — normal</option>
              <option value="P3">P3 — low</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Issue type</span>
            <select name="issueType" defaultValue="Open Action" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {["Open Action", "Blocker", "Risk Materialised", "Decision Required", "Scope Change Trigger"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Owner</span>
            <input name="owner" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <DueDateField />
        </div>
        <SubmitButton />
      </form>
    </div>
  );
}
