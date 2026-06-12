// Job intake assessment — the Assessment Engine (module 3) wired to a real
// intake for the construction vertical. The doc's invariant pattern:
//   intake → data collection cascade (geocoder) → AI analysis →
//   LEARNING_RULES application → structured output with confidence and
//   flagged assumptions → (on acceptance) the job + phases + budget + risks
//   are created, so jobs enter the platform THROUGH the engine.
// Accepting with an edited budget emits a correction, closing the loop.

import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import { emitCorrection } from "@/lib/platform/corrections";
import { geocodeProviders } from "@/lib/platform/geocode";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord } from "@/lib/platform/recordWriter";
import { resolveField, CascadeOutcome } from "@/lib/platform/sourceCascade";
import { OrgCtx } from "@/lib/platform/types";
import type { GeocodeResult } from "@/lib/platform/geocode";
import { runAssessment } from "../assessment";

export interface AssessmentIntakeInput {
  name: string;
  engagementType: string;
  address: string;
  suburb: string;
  sizeSqm?: number;
  scope: string;
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
  const geo = await resolveField(geocodeProviders(fullAddress));
  const suburb = geo.value?.suburb || input.suburb;

  // 2. AI analysis.
  const { system, version } = getPrompt("assessment.construction");
  const res = await callClaude(
    system,
    JSON.stringify({
      scope: input.scope,
      engagementType: input.engagementType,
      location: geo.value?.formatted ?? `${input.address} ${input.suburb}`.trim(),
      suburb,
      sizeSqm: input.sizeSqm ?? null,
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
      phases: estimate.phases,
      risks: estimate.risks,
      summary: estimate.summary,
    },
    demoMode: res.demo_mode,
  };

  const log = await prisma.platExecutionLog.create({
    data: {
      orgId: ctx.orgId,
      actorType: "ai",
      actorName: "Assessment Engine",
      operation: "generate",
      targetTable: "assessment",
      payload: JSON.stringify({ ...input, by: userName }),
      result: JSON.stringify(stored),
      status: "executed",
      executedAt: new Date(),
      promptVersion: version,
    },
  });
  return log.id;
}

export async function getAssessment(
  ctx: OrgCtx,
  execLogId: number,
): Promise<StoredAssessment | null> {
  const log = await prisma.platExecutionLog.findFirst({
    where: { id: execLogId, orgId: ctx.orgId, targetTable: "assessment" },
  });
  if (!log) return null;
  try {
    return JSON.parse(log.result) as StoredAssessment;
  } catch {
    return null;
  }
}

/** Acceptance gate: creates the job + phases + budget lines + risks from the
 *  assessment. An edited budget total emits a correction for the loop. */
export async function acceptAssessment(
  ctx: OrgCtx,
  userName: string,
  execLogId: number,
  edits: { budgetTotal?: number } = {},
): Promise<number> {
  const assessment = await getAssessment(ctx, execLogId);
  if (!assessment) throw new Error("Assessment not found");

  const aiBudget = Number(assessment.fields.budget_total?.value) || 0;
  const finalBudget = edits.budgetTotal ?? aiBudget;
  const seq = (await prisma.platJob.count({ where: { orgId: ctx.orgId } })) + 1;

  const jobResult = await writeRecord(ctx, {
    table: "job",
    op: "create",
    data: {
      code: `JOB-${String(seq).padStart(3, "0")}`,
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
        assessmentExecLogId: execLogId,
        overallConfidence: assessment.overallConfidence,
        appliedRules: assessment.appliedRules.map((r) => r.ruleCode),
      }),
    },
    actor: { type: "human", name: userName },
  });
  const jobId = jobResult.recordId!;

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
        budgetAmount: Math.round(line.amount * scale * 100) / 100,
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

  if (finalBudget !== aiBudget && aiBudget > 0) {
    await emitCorrection(
      ctx,
      { type: "human", name: userName },
      {
        jobId,
        entityType: "assessment",
        entityId: execLogId,
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
  return jobId;
}
