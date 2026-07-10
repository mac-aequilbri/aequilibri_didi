// Cashflow — Spec 12 per-transaction ledger per job. The period projected-vs-
// actual chart is derived from the transactions (Paid = actual, else projected).

import { CashflowLedger } from "./CashflowLedger";
import { TrendChart } from "@/components/charts";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { comparePeriods, formatPeriodLabel } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadCashflowJobs } from "@/lib/platform/cashflowSource";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function CashflowPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await loadCashflowJobs(ctx);

  return (
    <div className="p-6">
      <PageHeader
        title="Cashflow"
        subtitle="Money in and out by period. Paid entries are actuals; the rest are projected."
        actions={[{ href: orgPath(ctx.orgSlug, "/cashflow/new"), label: "+ New entry" }]}
      />

      {(() => {
        const byPeriod = new Map<string, { projected: number; actual: number }>();
        for (const job of jobs) {
          for (const c of job.conCashflows) {
            const agg = byPeriod.get(c.period) ?? { projected: 0, actual: 0 };
            if (c.status === "Paid") agg.actual += c.amount;
            else agg.projected += c.amount;
            byPeriod.set(c.period, agg);
          }
        }
        const periods = [...byPeriod.entries()].sort(([a], [b]) => comparePeriods(a, b));
        if (periods.length < 2) return null;
        return (
          <section className="ae-card p-5 mb-6">
            <h2 className="font-semibold mb-3">Organisation cashflow</h2>
            <TrendChart
              series={[
                { name: "Projected", points: periods.map(([label, v]) => ({ label: formatPeriodLabel(label), value: v.projected })) },
                { name: "Actual", points: periods.map(([label, v]) => ({ label: formatPeriodLabel(label), value: v.actual })) },
              ]}
              formatValue={(n) => `$${Math.round(n / 1000)}k`}
            />
          </section>
        );
      })()}

      {jobs.map((job) => {
        if (!job.conCashflows.length) return null;
        return (
          <section key={job.id} className="ae-card p-5 mb-6">
            <h2 className="font-semibold mb-3">
              {job.name} <span className="text-xs font-normal text-neutral-500">{job.code}</span>
            </h2>
            <CashflowLedger txns={job.conCashflows} orgSlug={ctx.orgSlug} />
          </section>
        );
      })}
      {jobs.every((j) => !j.conCashflows.length) && (
        <EmptyState
          title="No cashflow entries yet"
          hint="Log money in and out per period to spot squeezes early."
          action={{ href: orgPath(ctx.orgSlug, "/cashflow/new"), label: "+ New entry" }}
        />
      )}
    </div>
  );
}
