// Action Hub (core tier) — actions from any source: manual, chat, minutes.

import { prisma } from "@/lib/db";
import { MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { updateActionStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["open", "in_progress", "done", "deferred"] as const;

export default async function ActionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { status } = await searchParams;

  const where = {
    orgId: ctx.orgId,
    ...(status && STATUSES.includes(status as (typeof STATUSES)[number]) ? { status } : {}),
  };
  const [items, openCount, overdueCount, fromChat] = await Promise.all([
    prisma.platActionHub.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 200,
      include: { job: { select: { code: true } } },
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
    prisma.platActionHub.count({ where: { orgId: ctx.orgId, sourceType: "chat" } }),
  ]);

  const isOverdue = (a: (typeof items)[number]) =>
    a.dueDate && a.dueDate < new Date() && (a.status === "open" || a.status === "in_progress");

  return (
    <div className="p-6">
      <PageHeader
        title="Action Hub"
        subtitle="One queue for actions from every source — manual, assistant, meeting minutes."
        actions={[{ href: orgPath(ctx.orgSlug, "/actions/new"), label: "+ New action" }]}
      />
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <MetricCard value={openCount} label="Open / in progress" />
        <MetricCard value={overdueCount} label="Overdue" />
        <MetricCard value={fromChat} label="Created from chat" />
      </div>

      <div className="mb-4 flex gap-2 text-xs">
        <a href={orgPath(ctx.orgSlug, "/actions")} className={!status ? "btn-ae" : "btn-ae-outline"}>
          All
        </a>
        {STATUSES.map((s) => (
          <a
            key={s}
            href={orgPath(ctx.orgSlug, `/actions?status=${s}`)}
            className={status === s ? "btn-ae" : "btn-ae-outline"}
          >
            {s.replace("_", " ")}
          </a>
        ))}
      </div>

      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Action</th>
              <th className="py-1 pr-2">Owner</th>
              <th className="py-1 pr-2">Due</th>
              <th className="py-1 pr-2">Priority</th>
              <th className="py-1 pr-2">Source</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="py-2 pr-2">
                  <span className="font-medium">{a.title}</span>
                  {a.job?.code && (
                    <span className="ml-1 text-xs text-neutral-400">{a.job.code}</span>
                  )}
                  {a.detail && (
                    <span className="block text-xs text-neutral-500 line-clamp-1">{a.detail}</span>
                  )}
                </td>
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
                <td className="py-2">
                  <form action={updateActionStatus} className="flex items-center gap-1">
                    <input type="hidden" name="org" value={ctx.orgSlug} />
                    <input type="hidden" name="recordId" value={a.id} />
                    <StatusBadge status={isOverdue(a) ? "overdue" : a.status} />
                    <select
                      name="status"
                      defaultValue={a.status}
                      className="text-xs border border-neutral-200 rounded px-1 py-0.5"
                    >
                      {STATUSES.map((s) => (
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
            {items.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={6}>
                  No actions{status ? ` with status "${status}"` : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
