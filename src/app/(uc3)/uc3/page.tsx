import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import { getActiveTenant } from "@/lib/uc3-tenant";

export const dynamic = "force-dynamic";

async function loadDashboard(tenantId: number) {
  try {
    const [projects, openActions, overdueActions, openRisks] = await Promise.all([
      prisma.uc3Project.findMany({
        where: { tenantId },
        orderBy: { startDate: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          client: true,
          status: true,
          startDate: true,
          endDate: true,
          healthScore: true,
        },
      }),
      prisma.uc3ActionItem.count({ where: { tenantId, status: "open" } }),
      prisma.uc3ActionItem.count({ where: { tenantId, status: "overdue" } }),
      prisma.uc3Risk.findMany({
        where: { tenantId, status: "open" },
        select: { id: true, likelihood: true, impact: true },
      }),
    ]);

    const projectCount = await prisma.uc3Project.count({ where: { tenantId } });

    const statusCounts = await prisma.uc3Project.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { id: true },
    });

    const countByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      countByStatus[row.status] = row._count.id;
    }

    const highRisks = openRisks.filter((r) => r.likelihood * r.impact >= 15);

    return {
      projectCount,
      countByStatus,
      openActions,
      overdueActions,
      openRisks: openRisks.length,
      highRisks: highRisks.length,
      recentProjects: projects,
      connected: true,
    };
  } catch {
    return {
      projectCount: 0,
      countByStatus: {} as Record<string, number>,
      openActions: 0,
      overdueActions: 0,
      openRisks: 0,
      highRisks: 0,
      recentProjects: [] as {
        id: string;
        name: string;
        client: string | null;
        status: string;
        startDate: Date | null;
        endDate: Date | null;
        healthScore: number | null;
      }[],
      connected: false,
    };
  }
}

export default async function Uc3Dashboard() {
  const tenant = await getActiveTenant();

  if (!tenant) {
    return (
      <div className="px-8 py-12">
        <div className="ae-card p-8 text-center max-w-md mx-auto">
          <p className="text-neutral-600 mb-4">No tenant selected.</p>
          <Link href="/uc3/select-tenant" className="btn-ae">
            Select Tenant
          </Link>
        </div>
      </div>
    );
  }

  const {
    projectCount,
    countByStatus,
    openActions,
    overdueActions,
    openRisks,
    highRisks,
    recentProjects,
    connected,
  } = await loadDashboard(tenant.id);

  const activeProjects = countByStatus["active"] ?? 0;
  const planningProjects = countByStatus["planning"] ?? 0;

  return (
    <div>
      <PageHeader
        title="MSME Coordinator"
        subtitle={`Tenant: ${tenant.name}`}
        actions={[{ href: "/uc3/projects", label: "+ New Project" }]}
      />
      <div className="px-8">
        {!connected && (
          <div className="ae-card p-4 mb-6 text-sm text-neutral-600">
            Database not connected. Set <code>DATABASE_URL</code> to see live data.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-8">
          <MetricCard value={projectCount} label="Total Projects" />
          <MetricCard value={activeProjects} label="Active" />
          <MetricCard value={planningProjects} label="Planning" />
          <MetricCard value={openActions} label="Open Actions" />
          <MetricCard value={overdueActions} label="Overdue Actions" />
          <MetricCard value={highRisks} label="High Risks" />
        </div>

        <div className="ae-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--ae-earth)]">
            <h2 className="text-lg font-semibold">Recent Projects</h2>
            <Link href="/uc3/projects" className="btn-ae-outline text-sm">
              View all
            </Link>
          </div>
          {recentProjects.length === 0 ? (
            <p className="px-5 py-8 text-center text-neutral-500">No projects yet.</p>
          ) : (
            <table className="ae-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th className="text-right">Health</th>
                </tr>
              </thead>
              <tbody>
                {recentProjects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        href={`/uc3/projects/${p.id}`}
                        className="text-[var(--ae-space)] font-semibold"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.client ?? "—"}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>{p.startDate ? formatDate(p.startDate) : "—"}</td>
                    <td>{p.endDate ? formatDate(p.endDate) : "—"}</td>
                    <td className="text-right">
                      {p.healthScore != null ? `${p.healthScore}%` : "—"}
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
