// Learning Loop (module 6) — corrections cluster into hypotheses, humans
// promote them to rules, confidence compounds with every activation, and
// Intelligence Snapshots make the accumulated understanding auditable.

import { prisma } from "@/lib/db";
import { TrendChart } from "@/components/charts";
import { MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import {
  promoteHypothesisAction,
  rejectHypothesisAction,
  runEngineAction,
  snapshotAction,
  toggleRuleAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function LearningRulesPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const [rules, hypotheses, corrections, unclustered, snapshots] = await Promise.all([
    prisma.platLearningRule.findMany({
      where: { orgId: ctx.orgId },
      orderBy: [{ isActive: "desc" }, { confidence: "desc" }],
    }),
    prisma.platHypothesis.findMany({
      where: { orgId: ctx.orgId, status: "pending" },
      orderBy: { confidence: "desc" },
    }),
    prisma.platCorrection.count({ where: { orgId: ctx.orgId } }),
    prisma.platCorrection.count({ where: { orgId: ctx.orgId, hypothesisId: null } }),
    prisma.platIntelligenceSnapshot.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { capturedAt: "desc" },
      take: 24,
    }),
  ]);
  const trajectory = [...snapshots].reverse();

  const active = rules.filter((r) => r.isActive);
  const avgConfidence = active.length
    ? Math.round(active.reduce((s, r) => s + r.confidence, 0) / active.length)
    : 0;

  return (
    <div className="p-6">
      <PageHeader
        title="Automation rules"
        subtitle="Corrections → hypotheses → validated rules. Confidence compounds with every activation."
      />

      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <MetricCard value={active.length} label="Active rules" />
        <MetricCard value={avgConfidence} label="Avg confidence" />
        <MetricCard value={corrections} label="Corrections captured" />
        <MetricCard value={hypotheses.length} label="Hypotheses pending review" />
      </div>

      <div className="mb-6 flex gap-2">
        <form action={runEngineAction}>
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <button type="submit" className="btn-ae" title={`${unclustered} unclustered corrections`}>
            Run hypothesis engine ({unclustered} unclustered)
          </button>
        </form>
        <form action={snapshotAction}>
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <button type="submit" className="btn-ae-outline">
            Capture intelligence snapshot
          </button>
        </form>
      </div>

      {hypotheses.length > 0 && (
        <section className="ae-card p-5 mb-6 border-amber-300">
          <h2 className="font-semibold mb-3">Hypotheses awaiting review</h2>
          {hypotheses.map((h) => (
            <div key={h.id} className="border-t border-neutral-100 py-3 text-sm">
              <p className="font-medium">{h.description}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {h.dimension} · {h.sampleCount} samples · avg variance {h.avgVariancePct}% ·
                confidence {h.confidence}
              </p>
              <div className="mt-2 flex gap-2">
                <form action={promoteHypothesisAction}>
                  <input type="hidden" name="org" value={ctx.orgSlug} />
                  <input type="hidden" name="hypothesisId" value={h.id} />
                  <input type="hidden" name="kind" value="adjustment" />
                  <button className="btn-ae text-xs" title="Numeric adjustment applied by the assessment engine">
                    Promote as adjustment
                  </button>
                </form>
                <form action={promoteHypothesisAction}>
                  <input type="hidden" name="org" value={ctx.orgSlug} />
                  <input type="hidden" name="hypothesisId" value={h.id} />
                  <input type="hidden" name="kind" value="guidance" />
                  <button className="btn-ae-outline text-xs" title="Injected into the assistant's prompt">
                    Promote as guidance
                  </button>
                </form>
                <form action={rejectHypothesisAction}>
                  <input type="hidden" name="org" value={ctx.orgSlug} />
                  <input type="hidden" name="hypothesisId" value={h.id} />
                  <button className="btn-ae-outline text-xs text-red-600 border-red-300">Reject</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="ae-card p-5 mb-6">
        <h2 className="font-semibold mb-3">Rules</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Rule</th>
              <th className="py-1 pr-2">Kind</th>
              <th className="py-1 pr-2 text-right">Confidence</th>
              <th className="py-1 pr-2 text-right">Fired</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className={`border-t border-neutral-100 ${r.isActive ? "" : "opacity-50"}`}>
                <td className="py-2 pr-2">
                  <span className="font-mono text-xs text-neutral-400">{r.ruleCode}</span>{" "}
                  <span className="font-medium">{r.description}</span>
                  {r.cannotOverride && (
                    <span className="ml-1 text-[0.65rem] px-1 rounded bg-red-100 text-red-700">locked</span>
                  )}
                  {r.autoApply && (
                    <span className="ml-1 text-[0.65rem] px-1 rounded bg-emerald-100 text-emerald-700">auto-apply</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-xs">{r.kind}</td>
                <td className="py-2 pr-2 text-right text-xs font-semibold">{r.confidence}</td>
                <td className="py-2 pr-2 text-right text-xs">{r.timesTriggered}×</td>
                <td className="py-2 text-right">
                  <form action={toggleRuleAction} className="inline">
                    <input type="hidden" name="org" value={ctx.orgSlug} />
                    <input type="hidden" name="recordId" value={r.id} />
                    <input type="hidden" name="isActive" value={r.isActive ? "false" : "true"} />
                    <button className="btn-ae-outline text-xs">
                      {r.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={5}>
                  No rules yet — promote a hypothesis to create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {trajectory.length >= 2 && (
        <section className="ae-card p-5 mb-6">
          <h2 className="font-semibold mb-3">Confidence trajectory</h2>
          <TrendChart
            series={[
              {
                name: "Avg rule confidence",
                points: trajectory.map((s) => ({
                  label: s.capturedAt.toISOString().slice(5, 10),
                  value: s.avgConfidence,
                })),
              },
              ...(trajectory.some((s) => s.accuracyRatePct != null)
                ? [
                    {
                      name: "Accuracy %",
                      points: trajectory
                        .filter((s) => s.accuracyRatePct != null)
                        .map((s) => ({
                          label: s.capturedAt.toISOString().slice(5, 10),
                          value: s.accuracyRatePct!,
                        })),
                    },
                  ]
                : []),
            ]}
          />
        </section>
      )}

      <section className="ae-card p-5">
        <h2 className="font-semibold mb-3">Intelligence snapshots</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Captured</th>
              <th className="py-1 pr-2 text-right">Accuracy</th>
              <th className="py-1 pr-2 text-right">Active rules</th>
              <th className="py-1 pr-2 text-right">Avg confidence</th>
              <th className="py-1">Gaps</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.slice(0, 8).map((s) => {
              let gaps: string[] = [];
              try {
                gaps = JSON.parse(s.gaps);
              } catch {
                /* none */
              }
              return (
                <tr key={s.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDate(s.capturedAt)}</td>
                  <td className="py-2 pr-2 text-right text-xs">
                    {s.accuracyRatePct != null ? `${s.accuracyRatePct}%` : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right text-xs">
                    {s.activeRules} <span className="text-neutral-400">({s.autoApplyRules} auto)</span>
                  </td>
                  <td className="py-2 pr-2 text-right text-xs">{s.avgConfidence}</td>
                  <td className="py-2 text-xs text-neutral-500">{gaps.join(" · ") || "—"}</td>
                </tr>
              );
            })}
            {snapshots.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={5}>
                  No snapshots yet — capture one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="mt-4 text-xs text-neutral-400">
        Status legend: hypotheses come from clustered corrections; <StatusBadge status="pending" />{" "}
        means awaiting your review.
      </p>
    </div>
  );
}
