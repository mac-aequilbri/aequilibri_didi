// Project plan — workstreams (core tier) with their linked actions.

import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function ProjectPlanPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const workstreams = await prisma.platWorkstream.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { lastUpdated: "desc" },
    include: {
      job: { select: { code: true } },
      actions: { orderBy: { dueDate: "asc" }, take: 10 },
    },
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Project Plan"
        subtitle="Workstreams with their milestones and linked actions."
      />
      {workstreams.map((ws) => (
        <section key={ws.id} className="ae-card p-5 mb-6">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h2 className="font-semibold">
                {ws.name} <span className="text-xs font-normal text-neutral-400">{ws.job?.code}</span>
              </h2>
              {ws.milestone && (
                <p className="text-xs text-neutral-500">Milestone: {ws.milestone}</p>
              )}
            </div>
            <StatusBadge status={ws.status} />
          </div>
          {ws.description && <p className="text-sm text-neutral-600 mb-2">{ws.description}</p>}
          {ws.actions.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {ws.actions.map((a) => (
                  <tr key={a.id} className="border-t border-neutral-100">
                    <td className="py-1.5 pr-2">{a.title}</td>
                    <td className="py-1.5 pr-2 text-xs text-neutral-500 whitespace-nowrap">
                      {a.owner}
                      {a.dueDate ? ` · ${formatDate(a.dueDate)}` : ""}
                    </td>
                    <td className="py-1.5 text-right">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-neutral-400">Updated {formatDate(ws.lastUpdated)}</p>
        </section>
      ))}
      {workstreams.length === 0 && <p className="text-sm text-neutral-500">No workstreams yet.</p>}
    </div>
  );
}
