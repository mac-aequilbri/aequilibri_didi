// Job intake assessment — the Assessment Engine (module 3) wired to a real
// intake for the construction vertical. The doc's invariant pattern:
//   intake → data collection cascade (geocoder) → AI analysis →
//   LEARNING_RULES application → structured output with confidence and
//   flagged assumptions → (on acceptance) the job + phases + budget + risks
//   are created, so jobs enter the platform THROUGH the engine.
// Accepting with an edited budget emits a correction, closing the loop.

import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { emitCorrection } from "@/lib/platform/corrections";
import { geocodeProviders } from "@/lib/platform/geocode";
import { mulMoney } from "@/lib/platform/money";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord } from "@/lib/platform/recordWriter";
import { resolveField, CascadeOutcome } from "@/lib/platform/sourceCascade";
import { OrgCtx } from "@/lib/platform/types";
import type { GeocodeResult } from "@/lib/platform/geocode";
import { runAssessment } from "../assessment";
import { getCategory } from "@/lib/platform/jobCatalog";
import { reRoofBudgetSuggestion } from "@/services/uc1/pricing";
import { getMatchingGuidance } from "../learning";
import {
  applyTemplateWeeks,
  derivePhaseTemplate,
  type PhaseInput,
} from "./phaseTemplates";

export interface AssessmentIntakeInput {
  name: string;
  engagementType: string;
  address: string;
  suburb: string;
  sizeSqm?: number;
  scope: string;
  /** Job-category catalog key (industry reference); optional. */
  category?: string;
  /** Precise rooftop point chosen from Google Places autocomplete at intake.
   *  When present it's preferred over the geocoder cascade so the roof check
   *  locates the right building. */
  lat?: number;
  lng?: number;
}

interface AiEstimate {
  budgetTotal: number;
  durationWeeks: number;
  budgetBreakdown: { category: string; amount: number }[];
  phases: { name: string; weeks: number }[];
  risks: { description: string; likelihood: number; impact: number; mitigation: string }[];
  summary: string;
  confidence: number;
}

export interface StoredAssessment {
  input: AssessmentIntakeInput;
  geocode: {
    value: GeocodeResult | null;
    source: string;
    confidence: number;
    attempts: CascadeOutcome<GeocodeResult>["attempts"];
  };
  fields: Awaited<ReturnType<typeof runAssessment>>["fields"];
  appliedRules: Awaited<ReturnType<typeof runAssessment>>["appliedRules"];
  overallConfidence: number;
  detail: Pick<AiEstimate, "budgetBreakdown" | "phases" | "risks" | "summary">;
  /** Chosen job-category catalog key, and its label for display. */
  category?: string;
  categoryLabel?: string;
  /** Where the phase plan came from — learnings → catalog default → AI. */
  phaseSource: "learnings" | "catalog" | "ai";
  /** Provenance when phases were learned from history. */
  phaseLearning?: { sampleCount: number; sourceJobCodes: string[] };
  /** Immutable snapshot of the generated phases, so refinements can be diffed. */
  phasesGenerated: PhaseInput[];
  /** Set once a human edits the phase plan before acceptance. */
  phasesRefined?: boolean;
  /** Set once a human edits the budget breakdown before acceptance. */
  budgetRefined?: boolean;
  /** Guidance rules that informed the AI analysis. */
  guidanceApplied?: string[];
  demoMode: boolean;
}

function demoEstimate(input: AssessmentIntakeInput): AiEstimate {
  const size = input.sizeSqm && input.sizeSqm > 0 ? input.sizeSqm : 150;
  const budgetTotal = Math.round(size * 2600);
  return {
    budgetTotal,
    durationWeeks: Math.max(6, Math.round(size / 12)),
    budgetBreakdown: [
      { category: "Preliminaries", amount: Math.round(budgetTotal * 0.1) },
      { category: "Structure", amount: Math.round(budgetTotal * 0.4) },
      { category: "Services", amount: Math.round(budgetTotal * 0.2) },
      { category: "Finishes", amount: Math.round(budgetTotal * 0.3) },
    ],
    phases: [
      { name: "Site establishment", weeks: 2 },
      { name: "Structure", weeks: Math.max(3, Math.round(size / 30)) },
      { name: "Services & finishes", weeks: Math.max(3, Math.round(size / 40)) },
      { name: "Handover", weeks: 1 },
    ],
    risks: [
      {
        description: "Demo-mode estimate — no AI analysis performed",
        likelihood: 3,
        impact: 3,
        mitigation: "Configure ANTHROPIC_API_KEY for a real assessment.",
      },
    ],
    summary: `Demo estimate derived from ${size} m² at a flat regional rate.`,
    confidence: 30,
  };
}

export async function runConstructionAssessment(
  ctx: OrgCtx,
  userName: string,
  input: AssessmentIntakeInput,
): Promise<number> {
  // 1. Data collection cascade — geocode the address through real providers.
  const fullAddress = [input.address, input.suburb].filter(Boolean).join(" ");
  // Prefer the precise rooftop point picked from Google Places at intake (same
  // coordinate UC1 uses) — it lands on the dwelling, not a shed/parcel point.
  // Otherwise fall back to the geocoder cascade.
  const geo: CascadeOutcome<GeocodeResult> =
    Number.isFinite(input.lat) && Number.isFinite(input.lng)
      ? {
          value: { lat: input.lat!, lng: input.lng!, suburb: input.suburb, formatted: fullAddress },
          source: "google_places",
          confidence: 95,
          attempts: [],
        }
      : await resolveField(geocodeProviders(fullAddress));
  const suburb = geo.value?.suburb || input.suburb;

  // 1b. Known learnings + industry catalog — the phase structure is resolved
  //     learnings-first: prior jobs of the same category/engagement type take
  //     priority; the chosen catalog category is the expert default that
  //     fills the cold-start gap; the AI only adapts durations. Guidance rules
  //     make the whole analysis learning-aware.
  const category = getCategory(input.category);
  const ruleContext = {
    suburb,
    engagement_type: input.engagementType,
    ...(category ? { category: category.key } : {}),
  };
  const [phaseTemplate, guidance] = await Promise.all([
    derivePhaseTemplate(ctx, { engagementType: input.engagementType, category: category?.key }),
    getMatchingGuidance(ctx, ruleContext),
  ]);

  // 2. AI analysis.
  const { system, version } = getPrompt("assessment.construction");
  const res = await callClaude(
    system,
    JSON.stringify({
      scope: input.scope,
      jobCategory: category?.label,
      engagementType: input.engagementType,
      location: geo.value?.formatted ?? `${input.address} ${input.suburb}`.trim(),
      suburb,
      sizeSqm: input.sizeSqm ?? null,
      learnedPhases: phaseTemplate ? phaseTemplate.phases.map((p) => p.name) : undefined,
      catalogPhases: category ? category.phases : undefined,
      guidanceRules: guidance.length ? guidance.map((g) => g.description) : undefined,
    }),
    { model: modelFor("complex_reasoning"), maxTokens: 1500 },
  );

  let estimate: AiEstimate;
  let aiConfidence = 30;
  if (res.demo_mode) {
    estimate = demoEstimate(input);
    aiConfidence = estimate.confidence;
  } else {
    try {
      const parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
      estimate = {
        budgetTotal: Number(parsed.budgetTotal) || 0,
        durationWeeks: Number(parsed.durationWeeks) || 0,
        budgetBreakdown: Array.isArray(parsed.budgetBreakdown)
          ? parsed.budgetBreakdown.map((b: { category?: unknown; amount?: unknown }) => ({
              category: String(b.category ?? "Other"),
              amount: Number(b.amount) || 0,
            }))
          : [],
        phases: Array.isArray(parsed.phases)
          ? parsed.phases.map((p: { name?: unknown; weeks?: unknown }) => ({
              name: String(p.name ?? "Phase"),
              weeks: Number(p.weeks) || 1,
            }))
          : [],
        risks: Array.isArray(parsed.risks)
          ? parsed.risks.map(
              (r: { description?: unknown; likelihood?: unknown; impact?: unknown; mitigation?: unknown }) => ({
                description: String(r.description ?? ""),
                likelihood: Math.min(5, Math.max(1, Number(r.likelihood) || 3)),
                impact: Math.min(5, Math.max(1, Number(r.impact) || 3)),
                mitigation: String(r.mitigation ?? ""),
              }),
            )
          : [],
        summary: String(parsed.summary ?? ""),
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
      };
      aiConfidence = estimate.confidence;
    } catch {
      estimate = demoEstimate(input);
      estimate.summary = `AI output could not be parsed; deterministic fallback used. Raw: ${res.content.slice(0, 200)}`;
    }
  }

  // 2a. Re-roof budget seed: for re-roof jobs, replace the AI's budget with a
  //     deterministic breakdown from UC1's rate card, sized off the roof area
  //     (input.sizeSqm — the measured footprint after the roof check). It's an
  //     editable starting suggestion that matches how UC1 quotes re-roofs.
  if (category?.key === "reroof" && input.sizeSqm && input.sizeSqm > 0) {
    const seed = reRoofBudgetSuggestion(input.sizeSqm, { suburb });
    if (seed.lines.length) {
      estimate.budgetBreakdown = seed.lines;
      estimate.budgetTotal = seed.total;
    }
  }

  // 2b. Resolve the phase plan: learnings (prior jobs) → catalog (industry
  //     default for the chosen category) → AI. Whatever supplies the names,
  //     the AI supplies the week durations.
  let phases: PhaseInput[];
  let phaseSource: "learnings" | "catalog" | "ai";
  if (phaseTemplate) {
    phaseSource = "learnings";
    phases = applyTemplateWeeks(phaseTemplate, estimate.phases, estimate.durationWeeks);
  } else if (category) {
    phaseSource = "catalog";
    phases = applyTemplateWeeks(
      { phases: category.phases.map((name) => ({ name })), sampleCount: 0, sourceJobCodes: [] },
      estimate.phases,
      estimate.durationWeeks,
    );
  } else {
    phaseSource = "ai";
    phases = estimate.phases;
  }

  // 3+4. Judgment application + structured output: the generic engine applies
  // the org's adjustment rules to the numeric fields and scores confidence.
  const engineResult = await runAssessment(ctx, {
    context: { suburb, engagement_type: input.engagementType },
    fields: [
      {
        key: "budget_total",
        dimension: "budget.total",
        providers: [
          { name: "ai_estimate", confidence: aiConfidence, fetch: async () => estimate.budgetTotal },
        ],
      },
      {
        key: "duration_weeks",
        dimension: "schedule.duration",
        providers: [
          { name: "ai_estimate", confidence: aiConfidence, fetch: async () => estimate.durationWeeks },
        ],
      },
    ],
  });

  const stored: StoredAssessment = {
    input: { ...input, suburb },
    geocode: {
      value: geo.value,
      source: geo.source,
      confidence: geo.confidence,
      attempts: geo.attempts,
    },
    fields: engineResult.fields,
    appliedRules: engineResult.appliedRules,
    overallConfidence: engineResult.overallConfidence,
    detail: {
      budgetBreakdown: estimate.budgetBreakdown,
      phases,
      risks: estimate.risks,
      summary: estimate.summary,
    },
    category: category?.key,
    categoryLabel: category?.label,
    phaseSource,
    phaseLearning: phaseTemplate
      ? { sampleCount: phaseTemplate.sampleCount, sourceJobCodes: phaseTemplate.sourceJobCodes }
      : undefined,
    phasesGenerated: phases,
    guidanceApplied: guidance.length ? guidance.map((g) => g.ruleCode) : undefined,
    demoMode: res.demo_mode,
  };

  const assessment = await prisma.platAssessment.create({
    data: {
      orgId: ctx.orgId,
      name: input.name,
      engagementType: input.engagementType,
      address: input.address,
      suburb,
      sizeSqm: input.sizeSqm,
      scope: input.scope,
      result: JSON.stringify(stored),
      status: "draft",
      promptVersion: version,
      createdBy: userName,
    },
  });
  await prisma.platExecutionLog
    .create({
      data: {
        orgId: ctx.orgId,
        actorType: "ai",
        actorName: "Assessment Engine",
        operation: "generate",
        targetTable: "plat_core_assessment",
        targetId: assessment.id,
        payload: JSON.stringify({ ...input, by: userName }),
        result: `Assessment #${assessment.id} drafted (confidence ${stored.overallConfidence})`,
        status: "executed",
        executedAt: new Date(),
        promptVersion: version,
      },
    })
    .catch(() => {});
  return assessment.id;
}

export async function getAssessment(
  ctx: OrgCtx,
  assessmentId: number,
): Promise<StoredAssessment | null> {
  const row = await prisma.platAssessment.findFirst({
    where: { id: assessmentId, orgId: ctx.orgId },
  });
  if (!row) return null;
  try {
    return JSON.parse(row.result) as StoredAssessment;
  } catch {
    return null;
  }
}

/** Refine the draft assessment's phase plan before acceptance — rename,
 *  re-time, add, remove or reorder. Persisted onto the working set; the
 *  generated snapshot is kept so acceptance can diff and emit a correction. */
export async function refineAssessmentPhases(
  ctx: OrgCtx,
  assessmentId: number,
  phases: PhaseInput[],
): Promise<void> {
  const row = await prisma.platAssessment.findFirst({
    where: { id: assessmentId, orgId: ctx.orgId, status: "draft" },
  });
  if (!row) throw new Error("Assessment not found (already accepted or discarded?)");
  const stored = JSON.parse(row.result) as StoredAssessment;

  const clean = phases
    .map((p) => ({ name: String(p.name ?? "").trim().slice(0, 200), weeks: Math.max(0, Math.round(Number(p.weeks) || 0)) }))
    .filter((p) => p.name.length > 0);
  if (clean.length === 0) throw new Error("A job needs at least one phase.");

  stored.detail.phases = clean;
  stored.phasesRefined = true;
  await prisma.platAssessment.update({
    where: { id: row.id },
    data: { result: JSON.stringify(stored) },
  });
}

/** Refine the draft assessment's budget breakdown before acceptance — add,
 *  remove or adjust lines. The budget_total field is recomputed from the lines
 *  so the rest of the review (and acceptance) reflects the edit. */
export async function refineAssessmentBudget(
  ctx: OrgCtx,
  assessmentId: number,
  lines: { category: string; amount: number }[],
): Promise<void> {
  const row = await prisma.platAssessment.findFirst({
    where: { id: assessmentId, orgId: ctx.orgId, status: "draft" },
  });
  if (!row) throw new Error("Assessment not found (already accepted or discarded?)");
  const stored = JSON.parse(row.result) as StoredAssessment;

  const clean = lines
    .map((l) => ({ category: String(l.category ?? "").trim().slice(0, 120), amount: Math.round((Number(l.amount) || 0) * 100) / 100 }))
    .filter((l) => l.category.length > 0 && l.amount >= 0);

  stored.detail.budgetBreakdown = clean;
  const total = clean.reduce((s, l) => s + l.amount, 0);
  if (stored.fields.budget_total) {
    stored.fields.budget_total.value = total;
    stored.budgetRefined = true;
  }
  await prisma.platAssessment.update({
    where: { id: row.id },
    data: { result: JSON.stringify(stored) },
  });
}

/** Acceptance gate: creates the job + phases + budget lines + risks from the
 *  assessment. An edited budget total emits a correction for the loop. */
/** Next JOB-### code from the max existing suffix (count-based numbering
 *  duplicates after deletions); creation retries on the per-org unique. */
async function createJobWithCode(
  ctx: OrgCtx,
  userName: string,
  data: Record<string, unknown>,
): Promise<number> {
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    select: { code: true },
  });
  const max = jobs.reduce((m, j) => {
    const match = /^JOB-(\d+)$/.exec(j.code);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await writeRecord(ctx, {
        table: "job",
        op: "create",
        data: { ...data, code: `JOB-${String(max + 1 + attempt).padStart(3, "0")}` },
        actor: { type: "human", name: userName },
      });
      // Assessment → job-tree provisioning threads numeric FKs throughout and
      // stays on the Postgres path; the id is always an integer here.
      return result.recordId as number;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002" || attempt === 2) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function acceptAssessment(
  ctx: OrgCtx,
  userName: string,
  assessmentId: number,
  edits: { budgetTotal?: number } = {},
): Promise<number> {
  const row = await prisma.platAssessment.findFirst({
    where: { id: assessmentId, orgId: ctx.orgId, status: "draft" },
  });
  if (!row) throw new Error("Assessment not found (already accepted or discarded?)");
  const assessment = JSON.parse(row.result) as StoredAssessment;

  const aiBudget = Number(assessment.fields.budget_total?.value) || 0;
  const finalBudget = edits.budgetTotal ?? aiBudget;

  const jobId = await createJobWithCode(ctx, userName, {
    name: assessment.input.name,
    engagementType: assessment.input.engagementType,
    status: "active",
    address: assessment.input.address,
    suburb: assessment.input.suburb,
    lat: assessment.geocode.value?.lat,
    lng: assessment.geocode.value?.lng,
    budgetTotal: finalBudget,
    summary: assessment.detail.summary,
    meta: JSON.stringify({
      assessmentId,
      category: assessment.category,
      overallConfidence: assessment.overallConfidence,
      appliedRules: assessment.appliedRules.map((r) => r.ruleCode),
    }),
  });

  const scale = aiBudget > 0 ? finalBudget / aiBudget : 1;
  let sortOrder = 0;
  for (const phase of assessment.detail.phases) {
    sortOrder += 1;
    await writeRecord(ctx, {
      table: "phase",
      op: "create",
      data: { jobId, name: phase.name, sortOrder },
      actor: { type: "ai", name: "Assessment Engine" },
    });
  }
  for (const line of assessment.detail.budgetBreakdown) {
    await writeRecord(ctx, {
      table: "budget_line",
      op: "create",
      data: {
        jobId,
        category: line.category,
        description: "From intake assessment",
        budgetAmount: mulMoney(line.amount, scale),
      },
      actor: { type: "ai", name: "Assessment Engine" },
    });
  }
  for (const risk of assessment.detail.risks) {
    if (!risk.description) continue;
    await writeRecord(ctx, {
      table: "risk",
      op: "create",
      data: { jobId, ...risk, createdByAi: true },
      actor: { type: "ai", name: "Assessment Engine" },
    });
  }

  await prisma.platAssessment.update({
    where: { id: row.id },
    data: { status: "accepted", jobId },
  });

  if (finalBudget !== aiBudget && aiBudget > 0) {
    await emitCorrection(
      ctx,
      { type: "human", name: userName },
      {
        jobId,
        entityType: "assessment",
        entityId: assessmentId,
        dimension: "budget.total",
        aiValue: aiBudget,
        humanValue: finalBudget,
        rootCause: "estimator adjusted intake assessment budget",
        context: {
          suburb: assessment.input.suburb,
          engagement_type: assessment.input.engagementType,
        },
      },
    );
  }

  // Phase plan refined before acceptance → record a correction. The next
  // template derivation already reads this job's saved phases, so the
  // refinement also feeds the learnings structurally.
  const generatedNames = (assessment.phasesGenerated ?? assessment.detail.phases)
    .map((p) => p.name)
    .join(" → ");
  const finalNames = assessment.detail.phases.map((p) => p.name).join(" → ");
  if (generatedNames !== finalNames) {
    await emitCorrection(
      ctx,
      { type: "human", name: userName },
      {
        jobId,
        entityType: "assessment",
        entityId: assessmentId,
        dimension: "schedule.phases",
        aiValueText: generatedNames,
        humanValueText: finalNames,
        rootCause: `estimator refined the ${assessment.phaseSource === "learnings" ? "learned" : "AI-suggested"} phase plan`,
        context: {
          suburb: assessment.input.suburb,
          engagement_type: assessment.input.engagementType,
        },
      },
    );
  }
  return jobId;
}
