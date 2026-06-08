import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PhaseApprovalsPage() {
  const tenantId = await getTenantId();

  if (!tenantId) {
    return (
      <div className="px-8 py-16 text-neutral-500 text-sm">
        No tenant selected.{" "}
        <Link href="/uc3/select-tenant" className="text-blue-600 underline">
          Select one
        </Link>
        .
      </div>
    );
  }

  let pending: {
    id: number;
    name: string;
    order: number;
    status: string;
    completionPct: number;
    approvedBy: string;
    project: { id: number; name: string };
  }[] = [];

  try {
    pending = await db.uc3Phase.findMany({
      where: { tenantId, isAiDraft: true },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ project: { name: "asc" } }, { order: "asc" }],
    });
  } catch {
    // graceful empty state
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Phase Approvals"
        subtitle={`${pending.length} AI-drafted phase${pending.length === 1 ? "" : "s"} awaiting review`}
        actions={[{ href: "/uc3/projects", label: "Projects", variant: "outline" }]}
      />

      <div className="px-8">
        {pending.length === 0 ? (
          <div className="ae-card p-8 text-center text-neutral-500 text-sm">
            No AI-drafted phases pending approval.
          </div>
        ) : (
          <div className="ae-card overflow-hidden">
            <table className="ae-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Phase</th>
                  <th className="text-right">Order</th>
                  <th>Status</th>
                  <th className="text-right">Completion</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/uc3/projects/${p.project.id}`} className="text-blue-600 hover:underline">
                        {p.project.name}
                      </Link>
                    </td>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-right">{p.order}</td>
                    <td>{p.status}</td>
                    <td className="text-right">{p.completionPct}%</td>
                    <td className="text-right">
                      <Link href={`/uc3/phases/${p.id}/review`} className="btn-ae-outline text-xs">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
