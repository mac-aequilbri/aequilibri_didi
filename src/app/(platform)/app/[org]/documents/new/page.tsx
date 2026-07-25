import { CreateForm } from "@/components/form/CreateForm";
import { PageHeader } from "@/components/PageHeader";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { uploadDocument } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadJobOptions(ctx);

  return (
    <div className="p-6 max-w-xl">
      <PageHeader
        title="Add document"
        subtitle="Upload a file (classified + parsed automatically) or save an external link."
      />
      <CreateForm action={uploadDocument} submitLabel="Save document" pendingLabel="Uploading…" className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job</span>
            <select name="jobId" required defaultValue="" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="" disabled>Select a project…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Title</span>
            <input name="title" placeholder="(defaults to filename)" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Topic hint</span>
            <input name="topic" placeholder="Vendor or topic" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Reference hint</span>
            <input name="reference" placeholder="Invoice-123 / Quote-AB1" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Document date</span>
            <input name="documentDate" type="date" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Document type override</span>
            <input name="docType" placeholder="Optional for links" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">File upload</span>
          <input type="file" name="file" className="mt-1 w-full text-sm" />
        </label>
        <div className="text-xs text-neutral-500 text-center">— or —</div>
        <label className="block text-sm">
          <span className="text-neutral-600">External link (Drive, Dropbox…)</span>
          <input name="url" type="url" placeholder="https://…" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
      </CreateForm>
    </div>
  );
}
