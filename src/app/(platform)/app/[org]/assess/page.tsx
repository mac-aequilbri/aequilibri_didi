// New Job Assessment — the Assessment Engine's intake screen. Intake form on
// the left; once run, the structured output (per-field confidence, applied
// rules, flagged assumptions, source-cascade provenance) renders for review,
// and acceptance creates the job + phases + budget + risks.

import { PageHeader } from "@/components/PageHeader";
import { currency } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { getAssessment } from "@/services/platform/construction/assess";
import { generateProposalAction } from "./actions";
import { GenerateProposalButton } from "./SubmitButtons";
import { IntakeForm } from "./IntakeForm";
import { PhaseRefiner } from "./PhaseRefiner";
import { BudgetRefiner } from "./BudgetRefiner";
import { RoofAssessmentModule } from "./RoofAssessmentModule";

export const dynamic = "force-dynamic";

export default async function AssessPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { run } = await searchParams;
  // run is the assessment id from the redirect — a numeric string (Postgres) or
  // a "rec…" id (Airtable). Pass it through verbatim, never Number()-coerced.
  const assessment = run ? await getAssessment(ctx, run) : null;

  const budgetField = assessment?.fields.budget_total;
  const durationField = assessment?.fields.duration_weeks;

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="New Job Assessment"
        subtitle="Intake → source cascade → AI analysis → learning rules → structured output. Accepting the assessment creates the job."
        actions={[
          { href: `/app/${ctx.orgSlug}/assess/tender`, label: "Tender comparison", variant: "outline" },
          { href: `/app/${ctx.orgSlug}/assess/architectural`, label: "Architectural scope", variant: "outline" },
        ]}
      />

      {!assessment && (
        <IntakeForm
          orgSlug={ctx.orgSlug}
          allowedEngagementTypes={ctx.allowedEngagementTypes}
          defaultEngagementType={ctx.defaultEngagementType}
          mapsApiKey={process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || ""}
        />
      )}

      {assessment && (
        <div className="space-y-6">
          <section className="ae-card p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold">{assessment.input.name}</h2>
                <p className="text-xs text-neutral-500">
                  {assessment.input.engagementType.replace("_", " ")} ·{" "}
                  {assessment.geocode.value?.formatted ||
                    `${assessment.input.address} ${assessment.input.suburb}`.trim() ||
                    "no address"}
                  {assessment.demoMode ? " · demo mode" : ""}
                </p>
              </div>
              <span className="text-sm font-semibold px-3 py-1 rounded-full bg-neutral-100">
                Overall confidence {assessment.overallConfidence}
              </span>
            </div>
            {assessment.detail.summary && (
              <p className="text-sm mt-3">{assessment.detail.summary}</p>
            )}

            <div className="grid grid-cols-2 gap-4 mt-4">
              {[
                ["Budget total", budgetField, currency(Number(budgetField?.value) || 0)],
                ["Duration", durationField, `${durationField?.value ?? "—"} weeks`],
              ].map(([label, field, display]) => {
                const f = field as typeof budgetField;
                return (
                  <div key={String(label)} className="border border-neutral-100 rounded p-3">
                    <p className="text-xs text-neutral-500">{String(label)}</p>
                    <p className="text-xl font-bold">{String(display)}</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      source {f?.source} · confidence {f?.confidence}
                      {f?.adjustedBy.length ? ` · adjusted by ${f.adjustedBy.join(", ")}` : ""}
                    </p>
                    {f?.assumptions.map((a, i) => (
                      <p key={i} className="text-xs text-amber-700 mt-1">⚠ {a}</p>
                    ))}
                  </div>
                );
              })}
            </div>

            {assessment.appliedRules.length > 0 && (
              <p className="text-xs text-neutral-500 mt-3">
                Learning rules matched:{" "}
                {assessment.appliedRules
                  .map((r) => `${r.ruleCode} (conf ${r.confidence}${r.autoApply ? ", auto-applied" : ""})`)
                  .join(" · ")}
              </p>
            )}

            <details className="mt-3 text-xs text-neutral-500">
              <summary className="cursor-pointer">
                Source cascade — geocoded via {assessment.geocode.source}
              </summary>
              <ul className="mt-1 ml-4 list-disc">
                {assessment.geocode.attempts.map((a, i) => (
                  <li key={i}>
                    {a.source}: {a.ok ? "ok" : a.error ?? "no result"}
                  </li>
                ))}
                {assessment.geocode.attempts.length === 0 && (
                  <li>No geocoding providers configured.</li>
                )}
              </ul>
            </details>
          </section>

          {(assessment.category === "reroof" || assessment.category === "roof_repair") && (
            <RoofAssessmentModule
              orgSlug={ctx.orgSlug}
              assessmentId={run!}
              address={assessment.input.address}
              mapsApiKey={process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || ""}
              geocode={{
                lat: assessment.geocode.value?.lat,
                lng: assessment.geocode.value?.lng,
                formatted: assessment.geocode.value?.formatted,
                suburb: assessment.geocode.value?.suburb,
                source: assessment.geocode.source,
                confidence: assessment.geocode.confidence,
              }}
            />
          )}

          <section className="ae-card p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <h3 className="font-semibold text-sm">Project phases</h3>
              {assessment.phaseSource === "learnings" && assessment.phaseLearning ? (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ✓ Learned from {assessment.phaseLearning.sampleCount} prior{" "}
                  {assessment.categoryLabel ?? assessment.input.engagementType.replace("_", " ")} job
                  {assessment.phaseLearning.sampleCount === 1 ? "" : "s"}
                  {assessment.phaseLearning.sourceJobCodes.length
                    ? ` (${assessment.phaseLearning.sourceJobCodes.join(", ")})`
                    : ""}
                  {assessment.phasesRefined ? " · refined" : ""}
                </span>
              ) : assessment.phaseSource === "catalog" ? (
                <span className="text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  ⌂ Industry standard for {assessment.categoryLabel ?? "this category"} — first of its
                  kind here
                  {assessment.phasesRefined ? " · refined" : ""}
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">
                  AI-suggested — no category chosen
                  {assessment.phasesRefined ? " · refined" : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              {assessment.phaseSource === "learnings"
                ? "These follow how this customer structures similar jobs. Refine them for this job — changes are saved before you accept, and feed future plans."
                : assessment.phaseSource === "catalog"
                  ? "Industry-standard phases for this job category. Refine them for this job — once accepted, your own jobs become the template the next one learns from."
                  : "Refine the AI-suggested plan for this job. Once accepted, it becomes the template the next similar job learns from."}
            </p>
            <PhaseRefiner
              orgSlug={ctx.orgSlug}
              assessmentId={run!}
              initial={assessment.detail.phases}
              categoryLabel={assessment.categoryLabel}
              engagementType={assessment.input.engagementType}
              scope={assessment.input.scope}
              sizeSqm={assessment.input.sizeSqm}
            />
          </section>

          <section className="ae-card p-5 grid gap-6 sm:grid-cols-2">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-semibold text-sm">Budget breakdown</h3>
                {assessment.category === "reroof" && (
                  <span className="text-[11px] text-neutral-500">
                    seeded from UC1 rates{assessment.budgetRefined ? " · edited" : ""}
                  </span>
                )}
              </div>
              <BudgetRefiner
                orgSlug={ctx.orgSlug}
                assessmentId={run!}
                initial={assessment.detail.budgetBreakdown}
                categoryLabel={assessment.categoryLabel}
                scope={assessment.input.scope}
                sizeSqm={assessment.input.sizeSqm}
              />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Risks identified</h3>
              {assessment.detail.risks.map((r, i) => (
                <p key={i} className="text-sm border-t border-neutral-100 py-1.5">
                  {r.description}{" "}
                  <span className="text-xs text-neutral-500">
                    L{r.likelihood}×I{r.impact}
                  </span>
                </p>
              ))}
            </div>
          </section>

          <section className="ae-card p-5 relative">
            <form action={generateProposalAction} className="flex flex-wrap items-end gap-4">
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="assessmentId" value={run} />
              <label className="block text-sm">
                <span className="text-neutral-600">Proposal total (edit to correct the AI)</span>
                <input
                  type="number"
                  step="0.01"
                  name="budgetTotal"
                  defaultValue={Number(budgetField?.value) || 0}
                  className="mt-1 w-48 rounded border border-neutral-300 px-3 py-2"
                />
              </label>
              <GenerateProposalButton />
              <a href={`/app/${ctx.orgSlug}/assess`} className="btn-ae-outline">
                Discard / start over
              </a>
            </form>
            <p className="text-xs text-neutral-500 mt-2">
              This creates a proposal to send to the client — no project is created yet. The managed
              project is set up only once the client accepts. Editing the total records a correction
              that feeds the learning loop for future assessments in this region.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
