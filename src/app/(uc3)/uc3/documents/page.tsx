import { cookies } from "next/headers";
import Link from "next/link";
import { prisma as db } from "@/lib/db";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  let docs: Awaited<ReturnType<typeof db.uc3Document.findMany>> = [];

  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;
    let tenantId: number | null = val ? Number(val) : null;
    if (!tenantId) {
      const fallback = await db.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }
    if (tenantId) {
      docs = await db.uc3Document.findMany({
        where: { tenantId },
        orderBy: { uploadDate: "desc" },
        include: { project: { select: { name: true } } },
      });
    }
  } catch {
    // graceful empty state
  }

  const total = docs.length;
  const analysed = docs.filter((d) => d.aiAnalysis).length;
  const pending = total - analysed;

  return (
    <div className="pb-16">
      <PageHeader
        title="Documents"
        subtitle="Manage and analyse project documents"
        actions={[{ href: "/uc3/documents/new", label: "+ Upload Document" }]}
      />

      <div className="px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricCard value={total} label="Total Documents" />
          <MetricCard value={analysed} label="AI Analysed" />
          <MetricCard value={pending} label="Pending Analysis" />
        </div>

        <div className="ae-card overflow-hidden">
          {docs.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No documents yet.{" "}
              <Link href="/uc3/documents/new" className="text-blue-600 underline">
                Upload the first one.
              </Link>
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>AI Analysis</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.name}</td>
                    <td>
                      {(d as typeof d & { project?: { name: string } | null }).project?.name ?? "—"}
                    </td>
                    <td>{d.docType ?? "—"}</td>
                    <td>{d.version ?? "—"}</td>
                    <td>{d.uploadedBy ?? "—"}</td>
                    <td>
                      {d.uploadDate
                        ? new Date(d.uploadDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      {d.aiAnalysis ? (
                        <StatusBadge status="complete" />
                      ) : (
                        <StatusBadge status="pending" />
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/uc3/documents/${d.id}/analyze`}
                        className="btn-ae-outline text-xs px-3 py-1"
                      >
                        Analyze
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
