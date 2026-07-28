import { airtableEnabled } from "@/lib/airtable";
import { CreateForm } from "@/components/form/CreateForm";
import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { tableExists } from "@/lib/platform/optionalList";
import { createVendor } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewVendorPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);

  // VENDORS is optional on older bases — a create can't fall back to [], so
  // explain instead of offering a form whose save is doomed.
  if (airtableEnabled(ctx) && !(await tableExists(ctx.orgSlug, "VENDORS"))) {
    return (
      <div className="p-6 max-w-xl">
        <PageHeader title="New vendor" />
        <div className="ae-card p-5 text-sm text-neutral-600">
          This org&apos;s base doesn&apos;t have a <code>VENDORS</code>{" "}
          table, so vendors can&apos;t be added here yet.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title="New vendor" />
      <CreateForm action={createVendor} submitLabel="Add vendor" pendingLabel="Adding…" className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Name *</span>
            <input name="name" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Category</span>
            <input name="category" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Contact name</span>
            <input name="contactName" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Contact email</span>
            <input type="email" name="contactEmail" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Contact phone</span>
            <input name="contactPhone" type="tel" inputMode="tel" pattern="[0-9+()\-\s]{6,}" title="Digits, spaces and + ( ) - only" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Rating (1–10)</span>
            <input type="number" name="rating" min={1} max={10} defaultValue={5} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
      </CreateForm>
    </div>
  );
}
