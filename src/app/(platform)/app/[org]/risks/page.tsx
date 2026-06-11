// Risk register with likelihood × impact scoring and batch escalation.

import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { setRiskStatus } from "./actions";

export const dynamic = "force-dynamic";

function scoreClass(score: number): string {
  if (score >= 15) return "bg-red-100 text-red-800";
  if (score >= 8) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export default async function RisksPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const risks = await prisma.platConRisk.findMany({
    where: { orgId: ctx.orgId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { job: { select: { code: true } } },
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Risk Register"
        subtitle="Likelihood × impact; high scores can be batch-escalated."
        actions={[
          { href: orgPath(ctx.orgSlug, "/risks/new"), label: "+ New risk" },
          { href: orgPath(ctx.orgSlug, "/risks/escalation"), label: "Escalation", variant: "outline" },
        ]}
      />
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Risk</th>
              <th className="py-1 pr-2">Score</th>
              <th className="py-1 pr-2">Owner</th>
              <th className="py-1 pr-2">Escalated</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => {
              const score = r.likelihood * r.impact;
              return (
                <tr key={r.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2">
                    <span className="font-medium">{r.description}</span>
                    {r.job?.code && <span className="ml-1 text-xs text-neutral-400">{r.job.code}</span>}
                    {r.createdByAi && (
                      <span className="ml-1 text-[0.65rem] px-1 rounded bg-violet-100 text-violet-700">AI</span>
                    )}
                    {r.mitigation && (
                      <span className="block text-xs text-neutral-500">
                        Mitigation: {r.mitigation}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${scoreClass(score)}`}>
                      {score}
                    </span>
                    <span className="ml-1 text-xs text-neutral-400">
                      L{r.likelihood}×I{r.impact}
                    </span>
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap text-xs">{r.owner || "—"}</td>
                  <td className="py-2 pr-2 text-xs">
                    {r.escalatedAt ? (
                      <span className="text-red-600" title={r.escalationNote}>
                        {r.escalatedAt.toISOString().slice(0, 10)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    <form action={setRiskStatus} className="flex items-center gap-1">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="recordId" value={r.id} />
                      <StatusBadge status={r.status} />
                      <select name="status" defaultValue={r.status} className="text-xs border border-neutral-200 rounded px-1 py-0.5">
                        {["open", "accepted", "mitigated", "closed"].map((s) => (
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
              );
            })}
            {risks.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={5}>
                  No risks recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
