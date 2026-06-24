import Link from "next/link";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { loadDocuments } from "@/lib/platform/documentsSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { ingestInboxAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ processed?: string; documents?: string; proposals?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const [docs, jobs, sync] = await Promise.all([loadDocuments(ctx), loadJobOptions(ctx), searchParams]);

  return (
    <div className="p-6">
      <PageHeader
        title="Documents"
        subtitle="Uploads are classified automatically; analysis extracts risks and obligations."
        actions={[{ href: orgPath(ctx.orgSlug, "/documents/new"), label: "+ Add document" }]}
      />
      {(sync.processed || sync.documents || sync.proposals) && (
        <div className="mb-4 ae-card p-4 text-sm text-neutral-700">
          Inbox sync processed {sync.processed || "0"} email(s), created {sync.documents || "0"} document(s),
          and queued {sync.proposals || "0"} proposal(s).
        </div>
      )}
      <form action={ingestInboxAction} className="ae-card p-4 mb-4 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block">
          <span className="text-neutral-600">Sync inbox against job</span>
          <select name="jobId" className="mt-1 w-64 rounded border border-neutral-300 px-3 py-2">
            <option value="">Auto-detect / org-level</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-ae">Run inbox ingestion</button>
      </form>
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Document</th>
              <th className="py-1 pr-2">Type</th>
              <th className="py-1 pr-2">Kind</th>
              <th className="py-1 pr-2">Added</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-neutral-100">
                <td className="py-2 pr-2">
                  {d.kind === "link" ? (
                    <a href={d.storageRef} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {d.title} ↗
                    </a>
                  ) : (
                    <Link href={orgPath(ctx.orgSlug, `/documents/${d.id}`)} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                  )}
                  <span className="ml-1 text-xs text-neutral-400">{d.jobCode}</span>
                  {d.version > 1 && <span className="ml-2 text-xs text-amber-700">v{d.version}</span>}
                  {d.aiSummary && (
                    <span className="block text-xs text-neutral-500 line-clamp-1">{d.aiSummary}</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-xs">{d.classification || d.docType || "—"}</td>
                <td className="py-2 pr-2 text-xs">{d.kind}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">
                  {formatDate(d.createdAt)} {d.uploadedBy ? `· ${d.uploadedBy}` : ""}
                </td>
                <td className="py-2">
                  <StatusBadge status={d.status} />
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6">
                  <EmptyState
                    title="No documents yet"
                    hint="Upload or link project files; the assistant can summarise and classify them."
                    action={{ href: orgPath(ctx.orgSlug, "/documents/new"), label: "+ New document" }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
