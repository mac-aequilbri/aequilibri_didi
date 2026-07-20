import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createJob } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { error } = await searchParams;

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New project" />
      {error === "save_failed" && (
        <p role="alert" className="text-red-600 text-sm mb-3">
          The project couldn&apos;t be saved — the org&apos;s base rejected the write. Check the
          server log for details.
        </p>
      )}
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
            <input type="number" step="0.01" min={0} inputMode="decimal" name="budgetTotal" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
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
        <SubmitButton label="Create project" pendingLabel="Creating…" />
      </form>
    </div>
  );
}
