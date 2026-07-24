// Action Hub (core tier) — actions from any source: manual, chat, minutes.

import { Fragment } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { GroupHeaderRow } from "@/components/GroupHeader";
import { EmptyState, MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { ACTION_STATUSES } from "@/lib/platform/actionStatus";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { actionsListConfig, loadActions } from "@/lib/platform/actionsSource";
import {
  hasActiveFilters,
  parseListQuery,
  sortAndPaginate,
  splitIntoGroups,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { orgPath } from "@/lib/platform/paths";
import { saveStatusMapping, updateActionStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function ActionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, actionsListConfig);
  const filtered = hasActiveFilters(query);

  const { items: matching, metrics, unmapped, total, facets } = await loadActions(ctx, query);
  const { items, page, pageCount } = sortAndPaginate(matching, query, actionsListConfig);
  const openCount = metrics.open;
  const overdueCount = metrics.overdue;
  const needsMapping = metrics.needsMapping;

  const isOverdue = (a: (typeof items)[number]) =>
    a.dueDate && a.dueDate < new Date() && (a.status === "open" || a.status === "in_progress");

  return (
    <div className="p-6">
      <PageHeader
        title="Action Hub"
        subtitle="One queue for actions from every source — manual, assistant, meeting minutes."
        actions={[{ href: orgPath(ctx.orgSlug, "/actions/new"), label: "+ New action" }]}
      />
      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <MetricCard value={openCount} label="Open / in progress" />
        <MetricCard value={overdueCount} label="Overdue" />
        <MetricCard value={needsMapping} label="Needs mapping" />
        <MetricCard value={matching.length} label={filtered ? "Matching filters" : "Total shown"} />
      </div>

      {unmapped.length > 0 && (
        <details className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4" open>
          <summary className="cursor-pointer text-sm font-semibold text-amber-800">
            {needsMapping} action{needsMapping === 1 ? "" : "s"} have an unrecognised status ·{" "}
            {unmapped.length} value{unmapped.length === 1 ? "" : "s"} to map
          </summary>
          <p className="mt-2 text-xs text-amber-700">
            These come from a migrated base whose status vocabulary doesn&apos;t match the platform&apos;s.
            Map each value to a canonical status — the original data is left untouched, and once mapped
            it counts correctly everywhere.
          </p>
          <div className="mt-3 space-y-2">
            {unmapped.map((u) => (
              <form
                key={u.raw}
                action={saveStatusMapping}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <input type="hidden" name="org" value={ctx.orgSlug} />
                <input type="hidden" name="raw" value={u.raw} />
                <span className="min-w-[10rem] flex-1 truncate">
                  <span className="font-medium">{u.raw}</span>
                  <span className="ml-1 text-amber-600">×{u.count}</span>
                </span>
                <span className="text-amber-700">map to</span>
                <select
                  name="status"
                  defaultValue={u.suggestion ?? "open"}
                  className="rounded border border-amber-300 bg-white px-1.5 py-1"
                >
                  {ACTION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-ae text-xs">
                  Map
                </button>
                {u.suggestion && <span className="text-amber-500">suggested: {u.suggestion.replace("_", " ")}</span>}
              </form>
            ))}
          </div>
        </details>
      )}

      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/actions")}
        config={toClientConfig(actionsListConfig)}
        query={query}
        shown={matching.length}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search actions…"
      >
      <div className="ae-card p-5 overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-1 pr-2">Action</th>
              <th scope="col" className="py-1 pr-2">Project</th>
              <th scope="col" className="py-1 pr-2">Owner</th>
              <th scope="col" className="py-1 pr-2">Due</th>
              <th scope="col" className="py-1 pr-2">Priority</th>
              <th scope="col" className="py-1 pr-2">Source</th>
              <th scope="col" className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {splitIntoGroups(items, query, actionsListConfig).map((section) => (
              <Fragment key={section.key}>
                {query.group && (
                  <GroupHeaderRow colSpan={7} label={section.label} count={section.count} />
                )}
                {section.rows.map((a) => (
              <tr key={a.id} className="relative border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2 pr-2">
                  <Link
                    href={orgPath(ctx.orgSlug, `/actions/${a.id}`)}
                    className="group inline-flex items-baseline gap-1 before:absolute before:inset-0"
                  >
                    <span className="font-medium group-hover:text-[var(--ae-space)] group-hover:underline">
                      {a.title}
                    </span>
                  </Link>
                  {a.issueType && a.issueType !== "Open Action" && (
                    <span className="ml-1 text-[0.65rem] px-1 rounded bg-amber-100 text-amber-800">
                      {a.issueType}
                    </span>
                  )}
                  {a.detail && (
                    <span className="block text-xs text-neutral-500 line-clamp-1">{a.detail}</span>
                  )}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs text-neutral-500">{a.jobCode || "—"}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{a.owner || "—"}</td>
                <td
                  className={`py-2 pr-2 whitespace-nowrap text-xs ${isOverdue(a) ? "text-red-600 font-semibold" : ""}`}
                >
                  {a.dueDate ? formatDate(a.dueDate) : "—"}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{a.priority}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs text-neutral-500">
                  {a.sourceType.replace("_", " ")}
                </td>
                <td className="relative z-10 py-2">
                  <form action={updateActionStatus} className="flex items-center gap-1">
                    <input type="hidden" name="org" value={ctx.orgSlug} />
                    <input type="hidden" name="recordId" value={a.id} />
                    {a.needsMapping ? (
                      <span
                        className="status-badge status-draft"
                        title="Unrecognised status — map it in the panel above"
                      >
                        {a.rawStatus || "(blank)"} · unmapped
                      </span>
                    ) : (
                      <StatusBadge status={isOverdue(a) ? "overdue" : a.status} />
                    )}
                    <select
                      name="status"
                      defaultValue={a.needsMapping ? "open" : a.status}
                      aria-label={`Status for ${a.title}`}
                      className="text-xs border border-neutral-200 rounded px-1 py-0.5"
                    >
                      {ACTION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
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
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6">
                  <EmptyState
                    title={filtered ? "No actions match these filters" : "No actions yet"}
                    hint={
                      filtered
                        ? "Try widening or clearing the filters above."
                        : "Actions from the assistant, meeting minutes, or added by hand all land in this one queue."
                    }
                    action={{ href: orgPath(ctx.orgSlug, "/actions/new"), label: "+ New action" }}
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
