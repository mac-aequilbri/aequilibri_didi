"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import {
  acceptAssessment,
  getAssessment,
  refineAssessmentPhases,
  runConstructionAssessment,
} from "@/services/platform/construction/assess";
import type { PhaseInput } from "@/services/platform/construction/phaseTemplates";
import {
  checkPhaseFeasibility,
  type FeasibilityResult,
} from "@/services/platform/construction/phaseFeasibility";

export async function runAssessmentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const name = String(formData.get("name") ?? "").trim();
  const scope = String(formData.get("scope") ?? "").trim();
  if (!name || !scope) return;
  const sizeRaw = Number(formData.get("sizeSqm"));
  const assessmentId = await runConstructionAssessment(ctx, user.name, {
    name,
    engagementType: String(formData.get("engagementType") ?? ctx.defaultEngagementType),
    address: String(formData.get("address") ?? "").trim(),
    suburb: String(formData.get("suburb") ?? "").trim(),
    sizeSqm: Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : undefined,
    scope,
    category: String(formData.get("category") ?? "").trim() || undefined,
  });
  redirect(orgPath(ctx.orgSlug, `/assess?run=${assessmentId}`));
}

export async function refinePhasesAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx);
  const assessmentId = Number(formData.get("assessmentId"));
  if (!assessmentId) return;
  let phases: PhaseInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("phases") ?? "[]"));
    if (Array.isArray(parsed)) {
      phases = parsed.map((p) => ({ name: String(p?.name ?? ""), weeks: Number(p?.weeks) || 0 }));
    }
  } catch {
    return;
  }
  if (phases.length === 0) return;
  await refineAssessmentPhases(ctx, assessmentId, phases);
  redirect(orgPath(ctx.orgSlug, `/assess?run=${assessmentId}`));
}

/**
 * AI feasibility check for the phase plan currently in the editor. Invoked
 * directly from the client (not a form), so it accepts a plain object and
 * returns the result. Auth is verified here because Server Functions are
 * reachable by direct POST, not just through the UI.
 */
export async function checkPhaseFeasibilityAction(args: {
  org: string;
  phases: { name: string; weeks: number }[];
  context: {
    categoryLabel?: string;
    engagementType?: string;
    scope?: string;
    sizeSqm?: number | null;
  };
}): Promise<FeasibilityResult> {
  const ctx = await requireOrgCtx(String(args.org ?? ""));
  await getCurrentUser(ctx);
  const phases = Array.isArray(args.phases)
    ? args.phases.map((p) => ({ name: String(p?.name ?? ""), weeks: Number(p?.weeks) || 0 }))
    : [];
  return checkPhaseFeasibility(phases, args.context ?? {});
}

/**
 * Re-run the draft assessment using the roof area measured by the mini UC1
 * module as the size of record. This regenerates the budget, duration, phases
 * and risks from the accurate roof area (a new draft run), so the measurement
 * genuinely informs the estimate rather than just being a visual.
 */
export async function reestimateWithRoofAreaAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const assessmentId = Number(formData.get("assessmentId"));
  const areaSqm = Number(formData.get("areaSqm"));
  if (!assessmentId || !Number.isFinite(areaSqm) || areaSqm <= 0) return;

  const stored = await getAssessment(ctx, assessmentId);
  if (!stored) return;

  const { input } = stored;
  const newId = await runConstructionAssessment(ctx, user.name, {
    name: input.name,
    engagementType: input.engagementType,
    address: input.address,
    suburb: input.suburb,
    sizeSqm: Math.round(areaSqm),
    scope: input.scope,
    category: stored.category,
  });
  redirect(orgPath(ctx.orgSlug, `/assess?run=${newId}`));
}

export async function acceptAssessmentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const assessmentId = Number(formData.get("assessmentId"));
  if (!assessmentId) return;
  const budgetRaw = Number(formData.get("budgetTotal"));
  const jobId = await acceptAssessment(ctx, user.name, assessmentId, {
    budgetTotal: Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : undefined,
  });
  redirect(orgPath(ctx.orgSlug, `/projects/${jobId}`));
}
