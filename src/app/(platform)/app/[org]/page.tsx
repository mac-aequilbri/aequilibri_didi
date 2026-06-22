// Engagement-aware org dashboard. Single long-project orgs see their one job
// front and centre; multi-job orgs see a portfolio summary.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { TrendChart } from "@/components/charts";
import { AttentionBanner, MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import type { AttentionItem } from "@/components/PageHeader";
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
      prisma.platPendingWrite.count({ where: { orgId: ctx.orgId, status: "proposed" } }),
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

  const cashflows = await prisma.platConCashflow.findMany({
    where: { orgId: ctx.orgId },
    select: { period: true, projected: true, actual: true },
  });
  const byPeriod = new Map<string, { projected: number; actual: number }>();
  for (const c of cashflows) {
    const agg = byPeriod.get(c.period) ?? { projected: 0, actual: 0 };
    agg.projected += Number(c.projected);
    agg.actual += Number(c.actual);
    byPeriod.set(c.period, agg);
  }
  const periods = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b));

  const budget = Number(budgetAgg._sum.budgetAmount ?? 0);
  const actual = Number(budgetAgg._sum.actualAmount ?? 0);
  const variancePct = budget > 0 ? Math.round(((actual - budget) / budget) * 1000) / 10 : 0;
  // Overspend (actual above budget) is the only variance that demands action.
  const overBudget = budget > 0 && variancePct > 0;

  // "What needs me" — only the items that actually require the user to act.
  const attention: AttentionItem[] = [];
  if (overdueActions > 0)
    attention.push({
      label: `${overdueActions} overdue action${overdueActions === 1 ? "" : "s"}`,
      href: p("/actions"),
      tone: "bad",
    });
  if (pendingProposals > 0)
    attention.push({
      label: `${pendingProposals} change${pendingProposals === 1 ? "" : "s"} awaiting approval`,
      href: p("/approvals"),
      tone: "warn",
    });
  if (overBudget)
    attention.push({ label: `Budget over by ${variancePct}%`, href: p("/budget"), tone: "bad" });

  return (
    <div className="p-6">
      <PageHeader
        title={ctx.orgName}
        subtitle={`${ctx.vertical} · ${ctx.defaultEngagementType.replace("_", " ")} · ${jobs.length} active job${jobs.length === 1 ? "" : "s"} shown`}
        actions={[{ href: p("/assistant"), label: `Ask ${ctx.config.assistant.name}` }]}
      />

      <AttentionBanner items={attention} />

      {/* Attention-first: alert metrics lead and only colour up when non-zero. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          value={overdueActions}
          label={overdueActions === 1 ? "Overdue action" : "Overdue actions"}
          tone="bad"
          href={p("/actions")}
        />
        <MetricCard
          value={pendingProposals}
          label="Awaiting your approval"
          tone="warn"
          href={p("/approvals")}
        />
        <MetricCard value={openActions} label="Open actions" href={p("/actions")} />
        <MetricCard
          value={activeRules}
          label="Automation rules active"
          tone={activeRules > 0 ? "good" : "neutral"}
          href={p("/learning-rules")}
        />
      </div>

      {periods.length >= 2 && (
        <section className="ae-card p-5 mb-6">
          <h2 className="font-semibold mb-3">Cashflow — projected vs actual</h2>
          <TrendChart
            series={[
              { name: "Projected", points: periods.map(([label, v]) => ({ label, value: v.projected })) },
              { name: "Actual", points: periods.map(([label, v]) => ({ label, value: v.actual })) },
            ]}
            formatValue={(n) => `$${Math.round(n / 1000)}k`}
          />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="ae-card p-5">
          <h2 className="font-semibold mb-3">
            {jobs.length === 1 ? "Project" : "Jobs"}{" "}
            <span className="text-xs font-normal text-neutral-500">
              budget {currency(budget)} · actual {currency(actual)} ({variancePct > 0 ? "+" : ""}
              {variancePct}%)
            </span>
          </h2>
          <div className="divide-y divide-neutral-100">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={p(`/projects/${job.id}`)}
                className="group flex items-center justify-between gap-3 -mx-2 px-2 py-2.5 rounded-md hover:bg-[var(--ae-cream)] transition-colors"
              >
                <span className="min-w-0">
                  <span className="font-medium group-hover:text-[var(--ae-space)]">{job.name}</span>
                  <span className="block text-xs text-neutral-500">
                    {job.code} · {job.engagementType.replace("_", " ")}
                  </span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-neutral-500 whitespace-nowrap">
                    {job.completionPct}% complete
                  </span>
                  <StatusBadge status={job.status} />
                  <span className="text-neutral-300 group-hover:text-[var(--ae-space)]">›</span>
                </span>
              </Link>
            ))}
            {jobs.length === 0 && <p className="py-4 text-sm text-neutral-500">No jobs yet.</p>}
          </div>
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
