import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadReferenceOptions } from "@/lib/platform/configSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createDecision } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewDecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { error } = await searchParams;
  const [jobs, categories] = await Promise.all([
    loadJobOptions(ctx),
    loadReferenceOptions(ctx, "budget_category"),
  ]);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New decision" />
      {error === "save_failed" && (
        <p role="alert" className="text-red-600 text-sm mb-3">
          The decision couldn&apos;t be saved — the org&apos;s base rejected the write. Check the
          server log for details.
        </p>
      )}
      <form action={createDecision} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Decision *</span>
          <textarea name="description" required rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Rationale</span>
          <textarea name="rationale" rows={3} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job</span>
            <select name="jobId" required defaultValue="" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="" disabled>Select a project…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Category</span>
            <select name="category" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Status</span>
            <select name="status" defaultValue="proposed" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="proposed">Proposed</option>
              <option value="confirmed">Confirmed</option>
              <option value="superseded">Superseded</option>
            </select>
          </label>
        </div>
        <SubmitButton label="Save decision" />
      </form>
    </div>
  );
}
