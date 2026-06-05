import { cookies } from "next/headers";
import Link from "next/link";
import { prisma as db } from "@/lib/db";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { deactivateToken } from "../actions";

export const dynamic = "force-dynamic";

export default async function PortalListPage() {
  let tokens: {
    id: number;
    token: string;
    label: string | null;
    isActive: boolean;
    viewsCount: number;
    expiresAt: Date | null;
    createdAt: Date;
    project: { id: number; name: string } | null;
  }[] = [];

  let projects: { id: number; name: string }[] = [];

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
      [tokens, projects] = await Promise.all([
        db.uc3ClientPortalToken.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          include: { project: { select: { id: true, name: true } } },
        }),
        db.uc3Project.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
    }
  } catch {
    // graceful empty state
  }

  const active = tokens.filter((t) => t.isActive).length;
  const totalViews = tokens.reduce((sum, t) => sum + t.viewsCount, 0);

  return (
    <div className="pb-16">
      <PageHeader
        title="Client Portal Tokens"
        subtitle="Manage read-only project portal links for clients"
      />

      <div className="px-8 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricCard value={tokens.length} label="Total Tokens" />
          <MetricCard value={active} label="Active" />
          <MetricCard value={totalViews} label="Total Views" />
        </div>

        {/* Quick-create links per project */}
        {projects.length > 0 && (
          <div className="ae-card p-4 space-y-2">
            <p className="text-sm font-medium text-neutral-700">
              Generate a new token for a project
            </p>
            <div className="flex flex-wrap gap-2">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/uc3/portal/${p.id}/manage`}
                  className="btn-ae-outline text-xs"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tokens table */}
        <div className="ae-card overflow-hidden">
          {tokens.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No portal tokens yet. Select a project above to generate one.
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Project</th>
                  <th>Token link</th>
                  <th>Views</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.label ?? "—"}</td>
                    <td className="text-neutral-600">
                      {t.project ? (
                        <Link
                          href={`/uc3/projects/${t.project.id}`}
                          className="hover:underline text-blue-600"
                        >
                          {t.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="font-mono text-xs text-neutral-500">
                      <Link
                        href={`/uc3/portal/public/${t.token}`}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        /portal/public/{t.token.slice(0, 12)}…
                      </Link>
                    </td>
                    <td className="text-center text-neutral-600">
                      {t.viewsCount}
                    </td>
                    <td className="text-neutral-500 text-sm">
                      {t.expiresAt ? formatDate(t.expiresAt) : "Never"}
                    </td>
                    <td className="text-neutral-500 text-sm">
                      {formatDate(t.createdAt)}
                    </td>
                    <td>
                      <StatusBadge status={t.isActive ? "active" : "cancelled"} />
                    </td>
                    <td>
                      {t.isActive && (
                        <form action={deactivateToken}>
                          <input type="hidden" name="tokenId" value={t.id} />
                          <button
                            type="submit"
                            className="btn-ae-outline text-xs text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Deactivate
                          </button>
                        </form>
                      )}
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
