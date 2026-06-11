import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const docs = await prisma.platDocument.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { job: { select: { code: true } } },
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Documents"
        subtitle="Uploads are classified automatically; analysis extracts risks and obligations."
        actions={[{ href: orgPath(ctx.orgSlug, "/documents/new"), label: "+ Add document" }]}
      />
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
                  <span className="ml-1 text-xs text-neutral-400">{d.job?.code}</span>
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
                <td className="py-4 text-neutral-500" colSpan={5}>
                  No documents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
