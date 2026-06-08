import { prisma as db } from "@/lib/db";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { escalateRisk, escalateAllRisks } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

type RiskWithProject = Awaited<
  ReturnType<typeof db.uc3Risk.findMany>
>[number] & {
  project: { id: number; name: string } | null;
};

function scoreColor(score: number) {
  if (score >= 20) return "text-red-700 font-bold";
  if (score >= 15) return "text-orange-600 font-semibold";
  return "text-neutral-700";
}

export default async function RiskEscalationPage() {
  let risks: RiskWithProject[] = [];

  try {
    const tenantId = await getTenantId();
    if (tenantId) {
      risks = (await db.uc3Risk.findMany({
        where: { tenantId },
        orderBy: [{ likelihood: "desc" }, { impact: "desc" }],
        include: { project: { select: { id: true, name: true } } },
      })) as RiskWithProject[];
    }
  } catch {
    // graceful empty state
  }

  const openRisks = risks.filter((r) => r.status === "open");
  const needsEscalation = openRisks.filter(
    (r) => r.likelihood * r.impact >= 15 && r.escalatedAt === null
  );
  const alreadyEscalated = risks.filter((r) => r.escalatedAt !== null);
  const closedOrAccepted = risks.filter(
    (r) => r.status === "accepted" || r.status === "closed"
  );

  return (
    <div className="pb-16">
      <PageHeader
        title="Risk Escalation"
        subtitle="Review high-severity risks and escalate to stakeholders"
        actions={[{ href: "/uc3/risks", label: "Risk Register" }]}
      />

      <div className="px-8 space-y-6">
        {/* Metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard value={openRisks.length} label="Total Open Risks" />
          <MetricCard
            value={needsEscalation.length}
            label="Needs Escalation"
          />
          <MetricCard
            value={alreadyEscalated.length}
            label="Already Escalated"
          />
        </div>

        {/* Needs Escalation */}
        <div className="ae-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="text-sm font-semibold text-neutral-800">
              Needs Escalation
              {needsEscalation.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-100 text-red-700 text-xs w-5 h-5 font-bold">
                  {needsEscalation.length}
                </span>
              )}
            </h2>

            {needsEscalation.length > 1 && (
              <form action={escalateAllRisks}>
                <input type="hidden" name="note" value="Bulk escalation" />
                <button type="submit" className="btn-ae text-xs px-3 py-1.5">
                  Escalate All ({needsEscalation.length})
                </button>
              </form>
            )}
          </div>

          {needsEscalation.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No risks currently require escalation.
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Project</th>
                  <th>Owner</th>
                  <th className="text-center">L</th>
                  <th className="text-center">I</th>
                  <th className="text-center">Score</th>
                  <th>Mitigation</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {needsEscalation.map((r) => {
                  const score = r.likelihood * r.impact;
                  return (
                    <tr key={r.id}>
                      <td className="max-w-xs">
                        <span className="line-clamp-2">{r.description}</span>
                        {r.createdByAi && (
                          <span className="text-xs text-violet-500 mt-0.5 block">
                            AI-identified
                          </span>
                        )}
                      </td>
                      <td>{r.project?.name ?? "—"}</td>
                      <td>{r.owner ?? "—"}</td>
                      <td className="text-center">{r.likelihood}</td>
                      <td className="text-center">{r.impact}</td>
                      <td className={`text-center ${scoreColor(score)}`}>
                        {score}
                      </td>
                      <td className="max-w-xs">
                        <span className="line-clamp-2 text-neutral-500">
                          {r.mitigation ?? "—"}
                        </span>
                      </td>
                      <td>
                        <form action={escalateRisk} className="flex gap-1">
                          <input
                            type="hidden"
                            name="riskId"
                            value={r.id}
                          />
                          <input
                            type="text"
                            name="note"
                            placeholder="Escalation note (optional)"
                            className="text-xs border border-neutral-200 rounded px-2 py-1 w-36"
                          />
                          <button
                            type="submit"
                            className="btn-ae text-xs px-3 py-1 whitespace-nowrap"
                          >
                            Escalate
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Already Escalated */}
        <div className="ae-card overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="text-sm font-semibold text-neutral-800">
              Already Escalated
            </h2>
          </div>

          {alreadyEscalated.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No risks have been escalated yet.
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Project</th>
                  <th>Owner</th>
                  <th className="text-center">Score</th>
                  <th>Status</th>
                  <th>Escalated At</th>
                  <th>Escalation Note</th>
                </tr>
              </thead>
              <tbody>
                {alreadyEscalated.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-xs">
                      <span className="line-clamp-2">{r.description}</span>
                    </td>
                    <td>{r.project?.name ?? "—"}</td>
                    <td>{r.owner ?? "—"}</td>
                    <td className={`text-center ${scoreColor(r.likelihood * r.impact)}`}>
                      {r.likelihood * r.impact}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="whitespace-nowrap text-sm text-neutral-500">
                      {r.escalatedAt
                        ? new Date(r.escalatedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-2 text-neutral-500">
                        {r.escalationNote ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Accepted / Closed */}
        {closedOrAccepted.length > 0 && (
          <div className="ae-card overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-800">
                Accepted / Closed
              </h2>
            </div>
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Project</th>
                  <th>Owner</th>
                  <th className="text-center">Score</th>
                  <th>Status</th>
                  <th>Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {closedOrAccepted.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-xs">
                      <span className="line-clamp-2">{r.description}</span>
                    </td>
                    <td>{r.project?.name ?? "—"}</td>
                    <td>{r.owner ?? "—"}</td>
                    <td className="text-center text-neutral-500">
                      {r.likelihood * r.impact}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-2 text-neutral-500">
                        {r.mitigation ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
