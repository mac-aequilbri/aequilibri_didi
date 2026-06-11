import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { uploadDocument } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { error } = await searchParams;
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="p-6 max-w-xl">
      <PageHeader
        title="Add document"
        subtitle="Upload a file (classified + parsed automatically) or save an external link."
      />
      {error === "too_large" && <p className="text-red-600 text-sm mb-3">File too large (max 5 MB).</p>}
      {error === "nothing_to_save" && (
        <p className="text-red-600 text-sm mb-3">Choose a file or enter a link.</p>
      )}
      <form action={uploadDocument} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job</span>
            <select name="jobId" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              <option value="">—</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} — {j.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Title</span>
            <input name="title" placeholder="(defaults to filename)" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">File upload</span>
          <input type="file" name="file" className="mt-1 w-full text-sm" />
        </label>
        <div className="text-xs text-neutral-400 text-center">— or —</div>
        <label className="block text-sm">
          <span className="text-neutral-600">External link (Drive, Dropbox…)</span>
          <input name="url" type="url" placeholder="https://…" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <button type="submit" className="btn-ae">
          Save document
        </button>
      </form>
    </div>
  );
}
