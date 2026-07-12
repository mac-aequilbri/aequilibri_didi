// Cashflow — Spec 12 per-transaction ledger per job. The period projected-vs-
// actual chart is derived from the transactions (Paid = actual, else projected).

import { CashflowLedger } from "./CashflowLedger";
import { FilterBar } from "@/components/FilterBar";
import { TrendChart } from "@/components/charts";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { comparePeriods, formatPeriodLabel } from "@/lib/format";
import {
  countEnumOptions,
  hasActiveFilters,
  parseListQuery,
  sortAndPaginate,
  toClientConfig,
  toPredicate,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadCashflowJobs } from "@/lib/platform/cashflowSource";
import { orgPath } from "@/lib/platform/paths";
import { cashflowListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

export default async function CashflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, cashflowListConfig);
  const filtered = hasActiveFilters(query);
  const allJobs = await loadCashflowJobs(ctx);
  const allTxns = allJobs.flatMap((j) => j.conCashflows);

  // The filter applies per job so the grouping survives; the trend chart is
  // built from the filtered rows, so it follows the filters too.
  const pred = toPredicate(query, cashflowListConfig);
  const jobs = allJobs.map((j) => ({
    ...j,
    conCashflows: filtered ? j.conCashflows.filter(pred) : j.conCashflows,
  }));
  const shownCount = jobs.reduce((s, j) => s + j.conCashflows.length, 0);

  // Pagination is per job section (a row pager would split the groupings);
  // the org-wide chart still aggregates every filtered row across pages.
  const visibleJobs = jobs.filter((j) => j.conCashflows.length > 0);
  const { items: pageJobs, page, pageCount } = sortAndPaginate(visibleJobs, query, {
    fields: [],
    pageSize: 8,
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Cashflow"
        subtitle="Money in and out by period. Paid entries are actuals; the rest are projected."
        actions={[{ href: orgPath(ctx.orgSlug, "/cashflow/new"), label: "+ New entry" }]}
      />

      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/cashflow")}
        config={toClientConfig(cashflowListConfig)}
        query={query}
        shown={shownCount}
        total={allTxns.length}
        counts={countEnumOptions(allTxns, cashflowListConfig)}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search entries…"
      >
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

      {pageJobs.map((job) => {
        return (
          <section key={job.id} className="ae-card p-5 mb-6">
            <h2 className="font-semibold mb-3">
              {job.name} <span className="text-xs font-normal text-neutral-500">{job.code}</span>
            </h2>
            <CashflowLedger txns={job.conCashflows} orgSlug={ctx.orgSlug} />
          </section>
        );
      })}
      {visibleJobs.length === 0 && (
        <EmptyState
          title={filtered ? "No entries match these filters" : "No cashflow entries yet"}
          hint={
            filtered
              ? "Try widening or clearing the filters above."
              : "Log money in and out per period to spot squeezes early."
          }
          action={{ href: orgPath(ctx.orgSlug, "/cashflow/new"), label: "+ New entry" }}
        />
      )}
      </FilterBar>
    </div>
  );
}
