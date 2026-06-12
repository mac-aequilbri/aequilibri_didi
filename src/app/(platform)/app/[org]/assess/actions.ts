"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import {
  acceptAssessment,
  runConstructionAssessment,
} from "@/services/platform/construction/assess";

export async function runAssessmentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const name = String(formData.get("name") ?? "").trim();
  const scope = String(formData.get("scope") ?? "").trim();
  if (!name || !scope) return;
  const sizeRaw = Number(formData.get("sizeSqm"));
  const execLogId = await runConstructionAssessment(ctx, user.name, {
    name,
    engagementType: String(formData.get("engagementType") ?? ctx.defaultEngagementType),
    address: String(formData.get("address") ?? "").trim(),
    suburb: String(formData.get("suburb") ?? "").trim(),
    sizeSqm: Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : undefined,
    scope,
  });
  redirect(orgPath(ctx.orgSlug, `/assess?run=${execLogId}`));
}

export async function acceptAssessmentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const execLogId = Number(formData.get("execLogId"));
  if (!execLogId) return;
  const budgetRaw = Number(formData.get("budgetTotal"));
  const jobId = await acceptAssessment(ctx, user.name, execLogId, {
    budgetTotal: Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : undefined,
  });
  redirect(orgPath(ctx.orgSlug, `/projects/${jobId}`));
}
