import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
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

  const sp = await searchParams;
  const statusFilter = sp.status?.trim() || undefined;

  let decisions: {
    id: number;
    description: string;
    status: string;
    isAiDraft: boolean;
    draftedBy: string;
    confirmedBy: string;
    createdAt: Date;
    project: { id: number; name: string };
  }[] = [];

  try {
    decisions = await db.uc3Decision.findMany({
      where: { tenantId, ...(statusFilter ? { status: statusFilter } : {}) },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    // graceful empty state
  }

  const tabs = ["all", "draft", "confirmed", "superseded"];

  return (
    <div className="pb-16">
      <PageHeader
        title="Decisions"
        subtitle="Project decision log — AI drafts, humans confirm"
        actions={[{ href: "/uc3/decisions/new", label: "+ New Decision" }]}
      />

      <div className="px-8 space-y-4">
        <div className="flex gap-2">
          {tabs.map((t) => {
            const active = (t === "all" && !statusFilter) || statusFilter === t;
            const href = t === "all" ? "/uc3/decisions" : `/uc3/decisions?status=${t}`;
            return (
              <Link
                key={t}
                href={href}
                className={`text-xs px-3 py-1 rounded-full border ${
                  active
                    ? "bg-neutral-800 text-white border-neutral-800"
                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </Link>
            );
          })}
        </div>

        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Project</th>
                <th>Source</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decisions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-neutral-500">
                    No decisions.
                  </td>
                </tr>
              ) : (
                decisions.map((d) => (
                  <tr key={d.id}>
                    <td className="max-w-md">
                      <Link href={`/uc3/decisions/${d.id}`} className="text-blue-600 hover:underline">
                        {d.description.length > 90 ? d.description.slice(0, 90) + "…" : d.description}
                      </Link>
                    </td>
                    <td>{d.project?.name ?? "—"}</td>
                    <td>{d.isAiDraft ? "AI draft" : d.draftedBy || "—"}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td>{formatDate(d.createdAt)}</td>
                    <td className="text-right">
                      <Link href={`/uc3/decisions/${d.id}`} className="text-xs text-blue-600 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
