// New Job Assessment — the Assessment Engine's intake screen. Intake form on
// the left; once run, the structured output (per-field confidence, applied
// rules, flagged assumptions, source-cascade provenance) renders for review,
// and acceptance creates the job + phases + budget + risks.

import { PageHeader } from "@/components/PageHeader";
import { currency } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { getAssessment } from "@/services/platform/construction/assess";
import { acceptAssessmentAction, runAssessmentAction } from "./actions";
import { AcceptAssessmentButton, RunAssessmentButton } from "./SubmitButtons";

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
  const assessment = run ? await getAssessment(ctx, Number(run)) : null;

  const budgetField = assessment?.fields.budget_total;
  const durationField = assessment?.fields.duration_weeks;

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="New Job Assessment"
        subtitle="Intake → source cascade → AI analysis → learning rules → structured output. Accepting the assessment creates the job."
      />

      {!assessment && (
        <form action={runAssessmentAction} className="ae-card p-5 space-y-4 relative">
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <label className="block text-sm">
            <span className="text-neutral-600">Job name *</span>
            <input name="name" required placeholder="Seaview Duplex" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-neutral-600">Address</span>
              <input name="address" placeholder="12 Ocean Parade" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Suburb</span>
              <input name="suburb" placeholder="Maroochydore" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Engagement type</span>
              <select name="engagementType" defaultValue={ctx.defaultEngagementType} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
                {ctx.allowedEngagementTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Approx. size (m²)</span>
              <input type="number" name="sizeSqm" min={1} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-neutral-600">Scope description *</span>
            <textarea
              name="scope"
              required
              rows={4}
              placeholder="Two-storey duplex, concrete slab, timber frame, mid-range finishes, sloping coastal block…"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </label>
          <RunAssessmentButton />
        </form>
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

          <section className="ae-card p-5 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold text-sm mb-2">Budget breakdown</h3>
              <table className="w-full text-sm">
                <tbody>
                  {assessment.detail.budgetBreakdown.map((b, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="py-1.5 pr-2">{b.category}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">{currency(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="font-semibold text-sm mb-2 mt-4">Phases</h3>
              <table className="w-full text-sm">
                <tbody>
                  {assessment.detail.phases.map((p, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="py-1.5 pr-2">{p.name}</td>
                      <td className="py-1.5 text-right text-xs">{p.weeks} wk</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <form action={acceptAssessmentAction} className="flex flex-wrap items-end gap-4">
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="assessmentId" value={run} />
              <label className="block text-sm">
                <span className="text-neutral-600">Final budget total (edit to correct the AI)</span>
                <input
                  type="number"
                  step="0.01"
                  name="budgetTotal"
                  defaultValue={Number(budgetField?.value) || 0}
                  className="mt-1 w-48 rounded border border-neutral-300 px-3 py-2"
                />
              </label>
              <AcceptAssessmentButton />
              <a href={`/app/${ctx.orgSlug}/assess`} className="btn-ae-outline">
                Discard / start over
              </a>
            </form>
            <p className="text-xs text-neutral-500 mt-2">
              Editing the budget before accepting records a correction, which feeds the learning
              loop for future assessments in this region.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
