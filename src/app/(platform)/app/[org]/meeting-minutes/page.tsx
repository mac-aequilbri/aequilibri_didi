import { Fragment } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { GroupHeaderRow } from "@/components/GroupHeader";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  splitIntoGroups,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadMeetingMinutes } from "@/lib/platform/domainListSources";
import { orgPath } from "@/lib/platform/paths";
import { minutesListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

export default async function MeetingMinutesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, minutesListConfig);
  const filtered = hasActiveFilters(query);
  const { items: minutes, total, matching, facets, page, pageCount } = applyListQuery(
    await loadMeetingMinutes(ctx),
    query,
    minutesListConfig,
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Meeting Minutes"
        subtitle="Paste raw minutes; the AI extracts action items, you confirm to create them."
        actions={[{ href: orgPath(ctx.orgSlug, "/meeting-minutes/new"), label: "+ New minutes" }]}
      />
      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/meeting-minutes")}
        config={toClientConfig(minutesListConfig)}
        query={query}
        shown={matching}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search minutes…"
      >
      <div className="ae-card p-5 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-1 pr-2">Meeting</th>
              <th scope="col" className="py-1 pr-2">Project</th>
              <th scope="col" className="py-1 pr-2">Date</th>
              <th scope="col" className="py-1 pr-2 text-right">Actions</th>
              <th scope="col" className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {splitIntoGroups(minutes, query, minutesListConfig).map((section) => (
              <Fragment key={section.key}>
                {query.group && (
                  <GroupHeaderRow colSpan={5} label={section.label} count={section.count} />
                )}
                {section.rows.map((m) => (
              <tr key={m.id} className="relative border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2 pr-2">
                  <Link href={orgPath(ctx.orgSlug, `/meeting-minutes/${m.id}`)} className="font-medium hover:underline before:absolute before:inset-0">
                    {m.title || `Meeting ${formatDate(m.meetingDate)}`}
                  </Link>
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs text-neutral-500">{m.jobCode || "—"}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDate(m.meetingDate)}</td>
                <td className="py-2 pr-2 text-right text-xs">{m.actionsCount}</td>
                <td className="py-2">
                  <StatusBadge status={m.status} />
                </td>
              </tr>
                ))}
              </Fragment>
            ))}
            {minutes.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6">
                  <EmptyState
                    title={filtered ? "No minutes match these filters" : "No minutes yet"}
                    hint={
                      filtered
                        ? "Try widening or clearing the filters above."
                        : "Paste raw minutes and the AI extracts action items for you to confirm."
                    }
                    action={{ href: orgPath(ctx.orgSlug, "/meeting-minutes/new"), label: "+ New minutes" }}
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
