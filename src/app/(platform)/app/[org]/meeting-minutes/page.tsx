import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
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
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Meeting</th>
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2 text-right">Actions</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {minutes.map((m) => (
              <tr key={m.id} className="border-t border-neutral-100">
                <td className="py-2 pr-2">
                  <Link href={orgPath(ctx.orgSlug, `/meeting-minutes/${m.id}`)} className="font-medium hover:underline">
                    {m.title || `Meeting ${formatDate(m.meetingDate)}`}
                  </Link>
                  <span className="ml-1 text-xs text-neutral-400">{m.jobCode}</span>
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDate(m.meetingDate)}</td>
                <td className="py-2 pr-2 text-right text-xs">{m.actionsCount}</td>
                <td className="py-2">
                  <StatusBadge status={m.status} />
                </td>
              </tr>
            ))}
            {minutes.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={4}>
                  {filtered ? "No minutes match these filters." : "No minutes yet."}
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
