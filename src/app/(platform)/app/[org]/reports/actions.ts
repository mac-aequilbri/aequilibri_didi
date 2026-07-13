"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam, type RecordId } from "@/lib/platform/recordWriter";
import {
  approveReport,
  generateWeeklyReport,
  markReportSent,
  ReportsUnavailableError,
} from "@/services/platform/construction/reports";

export async function generateReportAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = recordIdParam(formData.get("jobId"));
  const weekEnding =
    String(formData.get("weekEnding") ?? "") || new Date().toISOString().slice(0, 10);
  if (jobId == null) return;

  let id: RecordId | undefined;
  try {
    ({ id } = await generateWeeklyReport(ctx, user.name, jobId, weekEnding));
  } catch (err) {
    // A base without the WEEKLY_REPORTS table can't store a report — surface a
    // clear notice rather than a 500. (redirect() is outside the try so its
    // NEXT_REDIRECT control-flow signal isn't swallowed here.)
    if (err instanceof ReportsUnavailableError) {
      redirect(orgPath(ctx.orgSlug, "/reports?notice=unavailable"));
    }
    throw err;
  }
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
