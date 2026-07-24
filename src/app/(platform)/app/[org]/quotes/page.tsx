// Quotes across the org's jobs — client-facing priced offers. New quotes can
// be started blank or generated from a job's assessment budget breakdown.

import { Fragment } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { GroupHeaderRow } from "@/components/GroupHeader";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate } from "@/lib/format";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  splitIntoGroups,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadQuotes } from "@/lib/platform/domainListSources";
import { orgPath } from "@/lib/platform/paths";
import { quotesListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

export default async function QuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, quotesListConfig);
  const filtered = hasActiveFilters(query);
  const { items: quotes, total, matching, facets, page, pageCount } = applyListQuery(
    await loadQuotes(ctx),
    query,
    quotesListConfig,
  );

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Quotes"
        subtitle="Client-facing priced offers. Generate one from a job's budget, refine the lines, then send and track acceptance."
        actions={[{ href: orgPath(ctx.orgSlug, "/quotes/new"), label: "+ New quote" }]}
      />

      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/quotes")}
        config={toClientConfig(quotesListConfig)}
        query={query}
        shown={matching}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search quotes…"
      >
      {quotes.length === 0 ? (
        <EmptyState
          title={filtered ? "No quotes match these filters" : "No quotes yet"}
          hint={
            filtered
              ? "Try widening or clearing the filters above."
              : "Generate a quote from a job's budget or start one blank, then send and track acceptance."
          }
          action={{ href: orgPath(ctx.orgSlug, "/quotes/new"), label: "+ New quote" }}
        />
      ) : (
        <section className="ae-card p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[40rem]">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th scope="col" className="py-1 pr-2">Ref</th>
                  <th scope="col" className="py-1 pr-2">Project</th>
                  <th scope="col" className="py-1 pr-2">Quote</th>
                  <th scope="col" className="py-1 pr-2">Valid until</th>
                  <th scope="col" className="py-1 pr-2 text-right">Total</th>
                  <th scope="col" className="py-1 pr-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {splitIntoGroups(quotes, query, quotesListConfig).map((section) => (
                  <Fragment key={section.key}>
                    {query.group && (
                      <GroupHeaderRow colSpan={6} label={section.label} count={section.count} />
                    )}
                    {section.rows.map((q) => (
                  <tr key={q.id} className="relative border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 pr-2 font-mono text-xs">{q.refNumber}</td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs text-neutral-500">{q.jobCode || "—"}</td>
                    <td className="py-2 pr-2">
                      <Link className="font-medium hover:underline before:absolute before:inset-0" href={orgPath(ctx.orgSlug, `/quotes/${q.id}`)}>
                        {q.title}
                      </Link>
                      {q.clientName ? (
                        <span className="block text-xs text-neutral-500">{q.clientName}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-xs">{formatDate(q.validUntil)}</td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap font-semibold">
                      {currency(q.total)}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <StatusBadge status={q.status} />
                    </td>
                  </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      </FilterBar>
    </div>
  );
}
