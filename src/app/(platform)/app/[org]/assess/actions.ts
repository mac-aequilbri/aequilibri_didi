"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam } from "@/lib/platform/recordWriter";
import {
  acceptAssessment,
  getAssessment,
  refineAssessmentPhases,
  refineAssessmentBudget,
} from "@/services/platform/construction/assess";
import { runModule3Capability } from "@/services/platform/module3/engine";
import type { PhaseInput } from "@/services/platform/construction/phaseTemplates";
import {
  checkPhaseFeasibility,
  type FeasibilityResult,
} from "@/services/platform/construction/phaseFeasibility";
import {
  reviewBudget,
  type BudgetReviewResult,
} from "@/services/platform/construction/budgetReview";

export async function runAssessmentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const name = String(formData.get("name") ?? "").trim();
  const scope = String(formData.get("scope") ?? "").trim();
  if (!name || !scope) return;
  const sizeRaw = Number(formData.get("sizeSqm"));
  const latStr = String(formData.get("lat") ?? "").trim();
  const lngStr = String(formData.get("lng") ?? "").trim();
  const lat = latStr ? Number(latStr) : NaN;
  const lng = lngStr ? Number(lngStr) : NaN;
  const { resultId } = await runModule3Capability(ctx, user.name, {
    capability: "construction_intake",
    input: {
      name,
      engagementType: String(formData.get("engagementType") ?? ctx.defaultEngagementType),
      address: String(formData.get("address") ?? "").trim(),
      suburb: String(formData.get("suburb") ?? "").trim(),
      sizeSqm: Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : undefined,
      scope,
      category: String(formData.get("category") ?? "").trim() || undefined,
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
    },
  });
  const assessmentId = String(resultId);
  redirect(orgPath(ctx.orgSlug, `/assess?run=${assessmentId}`));
}

export async function refinePhasesAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx);
  const assessmentId = recordIdParam(formData.get("assessmentId"));
  if (assessmentId == null) return;
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
  const assessmentId = recordIdParam(formData.get("assessmentId"));
  const areaSqm = Number(formData.get("areaSqm"));
  if (assessmentId == null || !Number.isFinite(areaSqm) || areaSqm <= 0) return;

  const stored = await getAssessment(ctx, assessmentId);
  if (!stored) return;

  const { input } = stored;
  const { resultId: newId } = await runModule3Capability(ctx, user.name, {
    capability: "construction_intake",
    input: {
      name: input.name,
      engagementType: input.engagementType,
      address: input.address,
      suburb: input.suburb,
      sizeSqm: Math.round(areaSqm),
      scope: input.scope,
      category: stored.category,
      ...(Number.isFinite(input.lat) && Number.isFinite(input.lng) ? { lat: input.lat, lng: input.lng } : {}),
    },
  });
  redirect(orgPath(ctx.orgSlug, `/assess?run=${newId}`));
}

export async function refineBudgetAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx);
  const assessmentId = recordIdParam(formData.get("assessmentId"));
  if (assessmentId == null) return;
  let lines: { category: string; amount: number }[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("budget") ?? "[]"));
    if (Array.isArray(parsed)) {
      lines = parsed.map((l) => ({ category: String(l?.category ?? ""), amount: Number(l?.amount) || 0 }));
    }
  } catch {
    return;
  }
  await refineAssessmentBudget(ctx, assessmentId, lines);
  redirect(orgPath(ctx.orgSlug, `/assess?run=${assessmentId}`));
}

/** AI sanity-check of the budget breakdown currently in the editor. Invoked
 *  directly from the client; auth verified here (Server Functions are
 *  reachable by direct POST). */
export async function checkBudgetAction(args: {
  org: string;
  lines: { category: string; amount: number }[];
  context: { categoryLabel?: string; scope?: string; sizeSqm?: number | null };
}): Promise<BudgetReviewResult> {
  const ctx = await requireOrgCtx(String(args.org ?? ""));
  await getCurrentUser(ctx);
  const lines = Array.isArray(args.lines)
    ? args.lines.map((l) => ({ category: String(l?.category ?? ""), amount: Number(l?.amount) || 0 }))
    : [];
  return reviewBudget(lines, args.context ?? {});
}

export async function acceptAssessmentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const assessmentId = recordIdParam(formData.get("assessmentId"));
  if (assessmentId == null) return;
  const budgetRaw = Number(formData.get("budgetTotal"));
  const jobId = await acceptAssessment(ctx, user.name, assessmentId, {
    budgetTotal: Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : undefined,
  });
  redirect(orgPath(ctx.orgSlug, `/projects/${jobId}`));
}
