import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createJob } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New project" />
      <form action={createJob} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Code *</span>
            <input name="code" required placeholder="NS-032" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Engagement type</span>
            <select
              name="engagementType"
              defaultValue={ctx.defaultEngagementType}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            >
              {ctx.allowedEngagementTypes.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Name *</span>
          <input name="name" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Address</span>
            <input name="address" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Suburb</span>
            <input name="suburb" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Start date</span>
            <input type="date" name="startDate" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Target end</span>
            <input type="date" name="targetEndDate" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Budget total $</span>
            <input type="number" step="0.01" name="budgetTotal" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Status</span>
            <select name="status" defaultValue="active" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {["intake", "assessment", "active", "on_hold", "completed", "archived"].map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Summary</span>
          <textarea name="summary" rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <button type="submit" className="btn-ae">
          Create project
        </button>
      </form>
    </div>
  );
}
