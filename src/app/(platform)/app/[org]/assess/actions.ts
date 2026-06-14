"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import {
  acceptAssessment,
  refineAssessmentPhases,
  runConstructionAssessment,
} from "@/services/platform/construction/assess";
import type { PhaseInput } from "@/services/platform/construction/phaseTemplates";

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
