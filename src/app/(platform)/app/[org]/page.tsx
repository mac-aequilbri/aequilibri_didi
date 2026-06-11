// Engagement-aware org dashboard. Single long-project orgs see their one job
// front and centre; multi-job orgs see a portfolio summary.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { currency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const p = (path: string) => orgPath(ctx.orgSlug, path);

  const [jobs, openActions, overdueActions, pendingProposals, budgetAgg, recentLogs, activeRules] =
    await Promise.all([
      prisma.platJob.findMany({
        where: { orgId: ctx.orgId },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.platActionHub.count({
        where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] } },
      }),
      prisma.platActionHub.count({
        where: {
          orgId: ctx.orgId,
          status: { in: ["open", "in_progress"] },
          dueDate: { lt: new Date() },
        },
      }),
      prisma.platExecutionLog.count({ where: { orgId: ctx.orgId, status: "proposed" } }),
      prisma.platConBudgetLine.aggregate({
        where: { orgId: ctx.orgId },
        _sum: { budgetAmount: true, actualAmount: true },
      }),
      prisma.platExecutionLog.findMany({
        where: { orgId: ctx.orgId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.platLearningRule.count({ where: { orgId: ctx.orgId, isActive: true } }),
    ]);

  const budget = Number(budgetAgg._sum.budgetAmount ?? 0);
  const actual = Number(budgetAgg._sum.actualAmount ?? 0);
  const variancePct = budget > 0 ? Math.round(((actual - budget) / budget) * 1000) / 10 : 0;

  return (
    <div className="p-6">
      <PageHeader
        title={ctx.orgName}
        subtitle={`${ctx.vertical} · ${ctx.defaultEngagementType.replace("_", " ")} · ${jobs.length} active job${jobs.length === 1 ? "" : "s"} shown`}
        actions={[{ href: p("/assistant"), label: `Ask ${ctx.config.assistant.name}` }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard value={openActions} label="Open actions" />
        <MetricCard
          value={overdueActions}
          label={overdueActions === 1 ? "Overdue action" : "Overdue actions"}
        />
        <MetricCard value={pendingProposals} label="AI proposals awaiting approval" />
        <MetricCard value={activeRules} label="Active learning rules" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="ae-card p-5">
          <h2 className="font-semibold mb-3">
            {jobs.length === 1 ? "Project" : "Jobs"}{" "}
            <span className="text-xs font-normal text-neutral-500">
              budget {currency(budget)} · actual {currency(actual)} ({variancePct > 0 ? "+" : ""}
              {variancePct}%)
            </span>
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-neutral-100">
                  <td className="py-2 pr-2">
                    <span className="font-medium">{job.name}</span>
                    <span className="block text-xs text-neutral-500">
                      {job.code} · {job.engagementType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right text-xs text-neutral-500 whitespace-nowrap">
                    {job.completionPct}% complete
                  </td>
                  <td className="py-2 text-right">
                    <StatusBadge status={job.status} />
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td className="py-4 text-sm text-neutral-500">No jobs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="ae-card p-5">
          <h2 className="font-semibold mb-3">
            Recent activity{" "}
            <Link href={p("/exec-log")} className="text-xs font-normal text-neutral-500 hover:underline">
              full log →
            </Link>
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id} className="border-t border-neutral-100">
                  <td className="py-2 pr-2">
                    <span className="font-medium">
                      {log.operation} {log.targetTable.replace(/^plat_(core|con|cfg)_/, "")}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {log.actorType}
                      {log.actorName ? ` · ${log.actorName}` : ""}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <StatusBadge status={log.status} />
                  </td>
                </tr>
              ))}
              {recentLogs.length === 0 && (
                <tr>
                  <td className="py-4 text-sm text-neutral-500">No activity yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
