// COMMS coordination layer (Spec 10 Module 5) — the forward-looking schedule of
// required communications: who gets told what, by when. Pending items sort to
// the top by due date; overdue items are flagged.

import { Fragment } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { GroupHeaderRow } from "@/components/GroupHeader";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { loadComms } from "@/lib/platform/commsSource";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  splitIntoGroups,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { setCommStatus } from "./actions";
import { commsListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "sent", "acknowledged", "overdue"];

export default async function CommsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, commsListConfig);
  const filtered = hasActiveFilters(query);
  const { items: comms, total, matching, facets, page, pageCount } = applyListQuery(await loadComms(ctx), query, commsListConfig);

  return (
    <div className="p-6">
      <PageHeader
        title="Coordination Schedule"
        subtitle="COMMS — who needs to be told what, by when."
        actions={[{ href: orgPath(ctx.orgSlug, "/comms/new"), label: "+ New communication" }]}
      />
      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/comms")}
        config={toClientConfig(commsListConfig)}
        query={query}
        shown={matching}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search communications…"
      >
      <div className="ae-card p-5 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-1 pr-2">Topic</th>
              <th scope="col" className="py-1 pr-2">Type</th>
              <th scope="col" className="py-1 pr-2">Role</th>
              <th scope="col" className="py-1 pr-2">Due</th>
              <th scope="col" className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {splitIntoGroups(comms, query, commsListConfig).map((section) => (
              <Fragment key={section.key}>
                {query.group && (
                  <GroupHeaderRow colSpan={5} label={section.label} count={section.count} />
                )}
                {section.rows.map((c) => (
              <tr key={c.id} className="relative border-t border-neutral-100 align-top hover:bg-neutral-50">
                <td className="py-2 pr-2">
                  <Link
                    href={orgPath(ctx.orgSlug, `/comms/${c.id}`)}
                    className="font-medium hover:text-[var(--ae-space)] hover:underline before:absolute before:inset-0"
                  >
                    {c.topic}
                  </Link>
                  {c.notes && <span className="block text-xs text-neutral-500">{c.notes}</span>}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{c.messageType}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{c.stakeholderRole}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">
                  {c.dueDate ? (
                    <span className={c.isOverdue ? "text-red-600 font-medium" : ""}>
                      {formatDate(c.dueDate)}
                      {c.isOverdue && " (overdue)"}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="relative z-10 py-2 whitespace-nowrap">
                  <form action={setCommStatus} className="flex items-center gap-1">
                    <input type="hidden" name="org" value={ctx.orgSlug} />
                    <input type="hidden" name="recordId" value={c.id} />
                    <StatusBadge status={c.status} />
                    <select name="status" defaultValue={c.status} aria-label={`Status for ${c.topic}`} className="text-xs border border-neutral-200 rounded px-1 py-0.5">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-ae-outline text-xs">
                      Set
                    </button>
                  </form>
                </td>
              </tr>
                ))}
              </Fragment>
            ))}
            {comms.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6">
                  <EmptyState
                    title={filtered ? "No communications match these filters" : "No communications scheduled"}
                    hint={
                      filtered
                        ? "Try widening or clearing the filters above."
                        : "Track who needs to be told what, by when — notifications, approvals, escalations."
                    }
                    action={{ href: orgPath(ctx.orgSlug, "/comms/new"), label: "+ New communication" }}
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
