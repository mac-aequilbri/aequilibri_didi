"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import {
  approveReport,
  generateWeeklyReport,
  markReportSent,
} from "@/services/platform/construction/reports";

export async function generateReportAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = Number(formData.get("jobId"));
  const weekEnding =
    String(formData.get("weekEnding") ?? "") || new Date().toISOString().slice(0, 10);
  if (!jobId) return;
  const { id } = await generateWeeklyReport(ctx, user.name, jobId, weekEnding);
  revalidatePath(orgPath(ctx.orgSlug, "/reports"));
  redirect(orgPath(ctx.orgSlug, id ? `/reports/${id}` : "/reports"));
}

export async function approveReportAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const id = Number(formData.get("recordId"));
  if (id) await approveReport(ctx, user.name, id);
  revalidatePath(orgPath(ctx.orgSlug, `/reports/${id}`));
  revalidatePath(orgPath(ctx.orgSlug, "/reports"));
}

export async function markSentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const id = Number(formData.get("recordId"));
  if (id) await markReportSent(ctx, user.name, id);
  revalidatePath(orgPath(ctx.orgSlug, `/reports/${id}`));
  revalidatePath(orgPath(ctx.orgSlug, "/reports"));
}
