// Learning Loop (module 6) — corrections cluster into hypotheses, humans
// promote them to rules, confidence compounds with every activation, and
// Intelligence Snapshots make the accumulated understanding auditable.

import { TrendChart } from "@/components/charts";
import { MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/form/ConfirmSubmitButton";
import { SubmitButton } from "@/components/form/SubmitButton";
import { buttonClass } from "@/components/ui/Button";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadLearning } from "@/lib/platform/learningSource";
import {
  promoteHypothesisAction,
  rejectHypothesisAction,
  runEngineAction,
  seedCascadeRulesAction,
  setOverrideLevelAction,
  snapshotAction,
  toggleRuleAction,
} from "./actions";

// Spec 12 Override_Permission ladder chip tones.
const LEVEL_CHIP: Record<string, { label: string; variant: ChipVariant }> = {
  owner_only: { label: "owner-only", variant: "danger" },
  standard: { label: "standard", variant: "neutral" },
  advisory: { label: "advisory", variant: "info" },
};

export const dynamic = "force-dynamic";

export default async function LearningRulesPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const { rules, hypotheses, correctionsCount: corrections, unclustered, snapshots } =
    await loadLearning(ctx);
  const trajectory = [...snapshots].reverse().filter((s) => s.capturedAt !== null);

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
      <p className="-mt-3 mb-6 text-sm text-neutral-500">
        Rules the platform learns from your corrections — review hypotheses, promote the good
        ones, and they start shaping estimates.
      </p>

      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <MetricCard value={active.length} label="Active rules" />
        <MetricCard value={avgConfidence} label="Avg confidence" />
        <MetricCard value={corrections} label="Corrections captured" />
        <MetricCard value={hypotheses.length} label="Hypotheses pending review" />
      </div>

      <div className="mb-6 flex gap-2">
        <form action={runEngineAction}>
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <SubmitButton
            label={`Run hypothesis engine (${unclustered} unclustered)`}
            pendingLabel="Running…"
            title={`${unclustered} unclustered corrections`}
          />
        </form>
        <form action={snapshotAction}>
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <SubmitButton
            label="Capture intelligence snapshot"
            pendingLabel="Capturing…"
            className="btn-ae-outline"
          />
        </form>
        {!rules.some((r) => r.ruleCode.startsWith("CASCADE-")) && (
          <form action={seedCascadeRulesAction}>
            <input type="hidden" name="org" value={ctx.orgSlug} />
            <SubmitButton
              label="Seed cascade rules (Spec 12 M5)"
              pendingLabel="Seeding…"
              className="btn-ae-outline"
              title="Creates the 7 cascading-update rules: advisories active, write-effects as drafts you activate"
            />
          </form>
        )}
      </div>

      {hypotheses.length > 0 && (
        <section className="ae-card p-5 mb-6 border-ae-warning/30">
          <h2 className="font-semibold mb-3">Hypotheses awaiting review</h2>
          {hypotheses.map((h) => (
            <div key={h.id} className="border-t border-neutral-100 py-3 text-sm">
              <p className="font-medium">
                {h.description}
                <Chip variant="neutral" className="ml-1">
                  {h.hypothesisType}
                </Chip>
                {h.validated && (
                  <Chip variant="success" className="ml-1">
                    validated
                  </Chip>
                )}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {h.dimension} · {h.sampleCount}/{h.validationThreshold} evidence · avg variance{" "}
                {h.avgVariancePct}% · confidence {h.confidence}
              </p>
              <div className="mt-2 flex gap-2">
                {h.validated ? (
                  <>
                    <form action={promoteHypothesisAction}>
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="hypothesisId" value={h.id} />
                      <input type="hidden" name="kind" value="adjustment" />
                      <SubmitButton
                        label="Draft adjustment rule"
                        pendingLabel="Drafting…"
                        className="btn-ae text-xs"
                        title="Drafts a numeric adjustment rule for you to activate"
                      />
                    </form>
                    <form action={promoteHypothesisAction}>
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="hypothesisId" value={h.id} />
                      <input type="hidden" name="kind" value="guidance" />
                      <SubmitButton
                        label="Draft guidance rule"
                        pendingLabel="Drafting…"
                        className="btn-ae-outline text-xs"
                        title="Drafts a guidance rule for you to activate"
                      />
                    </form>
                  </>
                ) : (
                  <span className="text-xs text-neutral-500 self-center">
                    Needs {Math.max(0, h.validationThreshold - h.sampleCount)} more consistent
                    correction{h.validationThreshold - h.sampleCount === 1 ? "" : "s"} to validate
                  </span>
                )}
                <form action={rejectHypothesisAction}>
                  <input type="hidden" name="org" value={ctx.orgSlug} />
                  <input type="hidden" name="hypothesisId" value={h.id} />
                  <ConfirmSubmitButton
                    label="Reject"
                    confirmLabel="Confirm reject"
                    pendingLabel="Rejecting…"
                    className={buttonClass("danger", "sm")}
                  />
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
              <th scope="col" className="py-1 pr-2">Rule</th>
              <th scope="col" className="py-1 pr-2">Kind</th>
              <th scope="col" className="py-1 pr-2 text-right">Confidence</th>
              <th scope="col" className="py-1 pr-2 text-right">Fired</th>
              <th scope="col" className="py-1" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className={`border-t border-neutral-100 ${r.isActive ? "" : "opacity-50"}`}>
                <td className="py-2 pr-2">
                  <span className="font-mono text-xs text-neutral-500">{r.ruleCode}</span>{" "}
                  <span className="font-medium">{r.description}</span>
                  {r.cannotOverride && <Chip variant="danger" className="ml-1">locked</Chip>}
                  <Chip
                    variant={LEVEL_CHIP[r.overrideLevel]?.variant ?? "neutral"}
                    className="ml-1"
                    title="Override governance (Spec 12): who may override this rule"
                  >
                    {LEVEL_CHIP[r.overrideLevel]?.label ?? r.overrideLevel}
                  </Chip>
                  {r.relaxEligible && (
                    <form action={setOverrideLevelAction} className="inline ml-1">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="recordId" value={r.id} />
                      <input type="hidden" name="level" value="standard" />
                      <button
                        type="submit"
                        className="text-[0.65rem] px-1 rounded bg-ae-success-bg text-ae-success hover:bg-emerald-200"
                        title="10 applications without an override — the owner may relax this rule to Standard"
                      >
                        10 clean — relax to standard?
                      </button>
                    </form>
                  )}
                  {r.autoApply && <Chip variant="success" className="ml-1">auto-apply</Chip>}
                  {r.status === "draft" && (
                    <Chip variant="info" className="ml-1">draft — activate to apply</Chip>
                  )}
                  {r.status === "under_review" && (
                    <Chip variant="warning" className="ml-1">under review — confidence ≤ 50</Chip>
                  )}
                  {r.needsReview && (
                    <Chip variant="warning" className="ml-1">review — confidence ≤ 60</Chip>
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
                    <SubmitButton
                      label={r.isActive ? "Deactivate" : "Activate"}
                      pendingLabel="Updating…"
                      className="btn-ae-outline text-xs"
                    />
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
                  label: (s.capturedAt ?? new Date(0)).toISOString().slice(5, 10),
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
                          label: (s.capturedAt ?? new Date(0)).toISOString().slice(5, 10),
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
              <th scope="col" className="py-1 pr-2">Captured</th>
              <th scope="col" className="py-1 pr-2 text-right">Accuracy</th>
              <th scope="col" className="py-1 pr-2 text-right">Active rules</th>
              <th scope="col" className="py-1 pr-2 text-right">Avg confidence</th>
              <th scope="col" className="py-1">Gaps</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.slice(0, 8).map((s) => {
              const gaps = s.gaps;
              return (
                <tr key={s.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDate(s.capturedAt)}</td>
                  <td className="py-2 pr-2 text-right text-xs">
                    {s.accuracyRatePct != null ? `${s.accuracyRatePct}%` : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right text-xs">
                    {s.activeRules} <span className="text-neutral-500">({s.autoApplyRules} auto)</span>
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
      <p className="mt-4 text-xs text-neutral-500">
        Status legend: hypotheses come from clustered corrections; <StatusBadge status="pending" />{" "}
        means awaiting your review. Promotion creates a <em>draft</em> rule — no rule applies until
        you activate it. Overrides decay confidence by 5; a rule at 50 or below is automatically
        moved under review.
      </p>
    </div>
  );
}
