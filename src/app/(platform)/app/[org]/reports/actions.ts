"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam } from "@/lib/platform/recordWriter";
import { reportingCapabilities } from "@/lib/platform/reportingPolicy";
import {
  approveReport,
  generateReport,
  markReportSent,
} from "@/services/platform/construction/reports";

export async function generateReportAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const viewer = await getCurrentViewer(ctx);
  const caps = reportingCapabilities(viewer.role);
  if (!caps.canGenerateReports) throw new Error("Your role cannot generate reports.");
  const jobId = recordIdParam(formData.get("jobId"));
  const reportId = String(formData.get("reportId") ?? "") || "weekly_progress";
  const periodEnding =
    String(formData.get("weekEnding") ?? "") || new Date().toISOString().slice(0, 10);
  if (jobId == null) return;

  const { id } = await generateReport(
    ctx,
    { name: user.name, financeDetail: caps.showFinancialDetail },
    reportId,
    jobId,
    periodEnding,
  );
  revalidatePath(orgPath(ctx.orgSlug, "/reports"));
  redirect(orgPath(ctx.orgSlug, id ? `/reports/${id}` : "/reports"));
}

export async function approveReportAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const id = recordIdParam(formData.get("recordId"));
  if (id != null) await approveReport(ctx, user.name, id);
  revalidatePath(orgPath(ctx.orgSlug, `/reports/${id}`));
  revalidatePath(orgPath(ctx.orgSlug, "/reports"));
}

export async function markSentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const id = recordIdParam(formData.get("recordId"));
  if (id != null) await markReportSent(ctx, user.name, id);
  revalidatePath(orgPath(ctx.orgSlug, `/reports/${id}`));
  revalidatePath(orgPath(ctx.orgSlug, "/reports"));
}
