// PLAN task schedule (Spec 12 Core / Module 5 construct 5) — the task-level
// schedule behind the engagement: tasks linked to PHASES and JOBS with dates,
// status, and RAG. This table view is the mode-independent register; the
// engagement-type render modes (Gantt / checklist / workflow / season — Spec 12
// Module 8) build on top of it in the L5 pass (docs/spec12-lock-plan.md §8.1).

import { Fragment } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { GroupHeaderRow } from "@/components/GroupHeader";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { getDomainLabels, labelForAppField } from "@/lib/platform/domainLabels";
import { getEngagementProfile } from "@/lib/platform/engagementProfile";
import { loadPlanTasks } from "@/lib/platform/planSource";
import { PlanView } from "./PlanView";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  splitIntoGroups,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { setPlanTaskStatus } from "./actions";
import { planListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

const STATUSES = ["Not Started", "In Progress", "Complete", "Blocked", "Deferred"];

// Same palette as the Phase RAG board (phases/page.tsx).
const RAG_CLASS: Record<string, string> = {
  Red: "bg-red-100 text-red-800 border-red-300",
  Amber: "bg-amber-100 text-amber-800 border-amber-300",
  Green: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

const MODE_LABEL: Record<string, string> = {
  gantt: "Gantt",
  checklist: "checklist",
  workflow: "workflow states",
  season: "season calendar",
};

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const sp = await searchParams;
  // Register export (Spec 12 M8): same filters as the current view.
  const spQs = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      v == null ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]],
    ),
  ).toString();
  const exportHref = orgPath(ctx.orgSlug, `/plan/export${spQs ? `?${spQs}` : ""}`);
  const [tasks, profile, labels] = await Promise.all([
    loadPlanTasks(ctx),
    getEngagementProfile(ctx),
    getDomainLabels(ctx),
  ]);
  const query = parseListQuery(sp, planListConfig);
  const filtered = hasActiveFilters(query);
  const { items, total, matching, facets, page, pageCount } = applyListQuery(tasks, query, planListConfig);
  // DOMAIN_LABELS on list headers (lock plan §8.4) — hardcoded fallbacks apply
  // until the org's label rows exist.
  const th = (appKey: string, fallback: string) =>
    labelForAppField(labels, "plan", appKey) ?? fallback;

  return (
    <div className="p-6">
      <PageHeader
        title="Plan"
        subtitle={`PLAN — the task-level schedule. Engagement renders as ${MODE_LABEL[profile.planView] ?? profile.planView}.`}
        actions={[
          { href: exportHref, label: "Export CSV", variant: "outline" },
          { href: orgPath(ctx.orgSlug, "/plan/new"), label: "+ New task" },
        ]}
      />
      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/plan")}
        config={toClientConfig(planListConfig)}
        query={query}
        shown={matching}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search tasks…"
      >
      {/* Spec 12 M8: one PLAN view component, mode selected by engagement type.
          Renders the SAME filtered rows the register below shows. */}
      <PlanView tasks={items} mode={profile.planView} />
      <div className="ae-card p-5 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-1 pr-2">{th("name", "Task")}</th>
              <th scope="col" className="py-1 pr-2">{th("jobId", "Project")}</th>
              <th scope="col" className="py-1 pr-2">{th("phaseId", "Phase")}</th>
              <th scope="col" className="py-1 pr-2">{th("assignedToId", "Assigned")}</th>
              <th scope="col" className="py-1 pr-2">{th("startDate", "Start")}</th>
              <th scope="col" className="py-1 pr-2">{th("endDate", "End")}</th>
              <th scope="col" className="py-1 pr-2">{th("rag", "RAG")}</th>
              <th scope="col" className="py-1">{th("status", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {splitIntoGroups(items, query, planListConfig).map((section) => (
              <Fragment key={section.key}>
                {query.group && (
                  <GroupHeaderRow colSpan={8} label={section.label} count={section.count} />
                )}
                {section.rows.map((t) => (
                  <tr key={t.id} className="relative border-t border-neutral-100 align-top hover:bg-neutral-50">
                    <td className="py-2 pr-2">
                      <Link
                        href={orgPath(ctx.orgSlug, `/plan/${t.id}`)}
                        className="font-medium hover:text-[var(--ae-space)] hover:underline before:absolute before:inset-0"
                      >
                        {t.name}
                      </Link>
                      {t.notes && <span className="block text-xs text-neutral-500">{t.notes}</span>}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs text-neutral-500">{t.jobName || "—"}</td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">{t.phaseName || "—"}</td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">{t.assignedTo || "—"}</td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">
                      {t.startDate ? formatDate(t.startDate) : "—"}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">
                      {t.endDate ? (
                        <span className={t.isOverdue ? "text-red-600 font-medium" : ""}>
                          {formatDate(t.endDate)}
                          {t.isOverdue && " (overdue)"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {t.rag ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RAG_CLASS[t.rag] ?? ""}`}>
                          {t.rag}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="relative z-10 py-2 whitespace-nowrap">
                      <form action={setPlanTaskStatus} className="flex items-center gap-1">
                        <input type="hidden" name="org" value={ctx.orgSlug} />
                        <input type="hidden" name="recordId" value={t.id} />
                        <StatusBadge status={t.status} />
                        <select
                          name="status"
                          defaultValue={t.status}
                          aria-label={`Status for ${t.name}`}
                          className="text-xs border border-neutral-200 rounded px-1 py-0.5"
                        >
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
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6">
                  <EmptyState
                    title={filtered ? "No tasks match these filters" : "No plan tasks yet"}
                    hint={
                      filtered
                        ? "Try widening or clearing the filters above."
                        : "The task-level schedule: what happens when, linked to phases — the data behind the Gantt."
                    }
                    action={{ href: orgPath(ctx.orgSlug, "/plan/new"), label: "+ New task" }}
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
