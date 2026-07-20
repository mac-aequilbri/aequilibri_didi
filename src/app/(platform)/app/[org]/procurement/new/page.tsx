import { DateField } from "@/components/form/DateField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader } from "@/components/PageHeader";
import { loadVendorOptions } from "@/lib/platform/configSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { createProcurement } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewProcurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { error } = await searchParams;
  const [jobs, vendors] = await Promise.all([loadJobOptions(ctx), loadVendorOptions(ctx)]);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New procurement order" />
      {error === "save_failed" && (
        <p role="alert" className="text-red-600 text-sm mb-3">
          The order couldn&apos;t be saved — the org&apos;s base rejected the write. Check the
          server log for details.
        </p>
      )}
      <form action={createProcurement} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Item *</span>
          <input name="item" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
            <select name="jobId" required defaultValue="" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="" disabled>
                Select a project…
              </option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Vendor</span>
            <select name="vendorId" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="">— (or type below)</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Or add a new vendor</span>
            <input name="vendorName" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
            <span className="mt-0.5 block text-xs text-neutral-400">
              Used only if no vendor is selected above.
            </span>
          </label>
          <DateField name="dueDate" label="Due date" noPast />
          <label className="block text-sm">
            <span className="text-neutral-600">Qty</span>
            <input type="number" step="0.01" min={0} inputMode="decimal" name="qty" defaultValue={1} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Unit price $</span>
            <input type="number" step="0.01" min={0} inputMode="decimal" name="unitPrice" defaultValue={0} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <SubmitButton label="Create order" pendingLabel="Creating…" />
      </form>
    </div>
  );
}
