import { Fragment } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { GroupHeaderRow } from "@/components/GroupHeader";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, toNum } from "@/lib/format";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  splitIntoGroups,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadVariations } from "@/lib/platform/domainListSources";
import { orgPath } from "@/lib/platform/paths";
import { variationsListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

export default async function VariationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, variationsListConfig);
  const filtered = hasActiveFilters(query);
  const { items: variations, total, matching, facets, page, pageCount } = applyListQuery(
    await loadVariations(ctx),
    query,
    variationsListConfig,
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Variation Orders"
        subtitle="Scope changes with cost and time impact — AI drafts go through human approval."
        actions={[{ href: orgPath(ctx.orgSlug, "/variations/new"), label: "+ New / AI draft" }]}
      />
      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/variations")}
        config={toClientConfig(variationsListConfig)}
        query={query}
        shown={matching}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search variations…"
      >
      <div className="ae-card p-5 overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-1 pr-2">Ref</th>
              <th scope="col" className="py-1 pr-2">Title</th>
              <th scope="col" className="py-1 pr-2 text-right">Cost impact</th>
              <th scope="col" className="py-1 pr-2 text-right">Time</th>
              <th scope="col" className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {splitIntoGroups(variations, query, variationsListConfig).map((section) => (
              <Fragment key={section.key}>
                {query.group && (
                  <GroupHeaderRow colSpan={5} label={section.label} count={section.count} />
                )}
                {section.rows.map((v) => (
              <tr key={v.id} className="relative border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2 pr-2 whitespace-nowrap font-mono text-xs">
                  <Link href={orgPath(ctx.orgSlug, `/variations/${v.id}`)} className="hover:underline">
                    {v.refNumber || `#${v.id}`}
                  </Link>
                </td>
                <td className="py-2 pr-2">
                  <Link href={orgPath(ctx.orgSlug, `/variations/${v.id}`)} className="font-medium hover:underline before:absolute before:inset-0">
                    {v.title}
                  </Link>
                  <span className="ml-1 text-xs text-neutral-400">{v.jobCode}</span>
                  {v.isAiDrafted && (
                    <span className="ml-1 text-[0.65rem] px-1 rounded bg-violet-100 text-violet-700">AI</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(toNum(v.costImpact))}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap text-xs">
                  {v.timeImpactDays ? `${v.timeImpactDays}d` : "—"}
                </td>
                <td className="py-2">
                  <StatusBadge status={v.status} />
                </td>
              </tr>
                ))}
              </Fragment>
            ))}
            {variations.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6">
                  <EmptyState
                    title={filtered ? "No variations match these filters" : "No variation orders yet"}
                    hint={
                      filtered
                        ? "Try widening or clearing the filters above."
                        : "Capture scope changes with their cost and time impact for client sign-off."
                    }
                    action={{ href: orgPath(ctx.orgSlug, "/variations/new"), label: "+ New variation" }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </FilterBar>
    </div>
  );
}
