"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam } from "@/lib/platform/recordWriter";
import { analyzeDelayCascade, proposeDelayCascadeFollowUps } from "@/services/platform/construction/delay";

export async function runDelayCascade(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = recordIdParam(formData.get("jobId"));
  const trigger = String(formData.get("trigger") ?? "").trim();
  const delayDays = Number(formData.get("delayDays")) || 0;
  const createFollowUps = String(formData.get("createFollowUps") ?? "") === "1";
  if (jobId == null || !trigger || delayDays <= 0) return;
  const cascade = await analyzeDelayCascade(ctx, user.name, jobId, trigger, delayDays);
  if (createFollowUps) {
    await proposeDelayCascadeFollowUps(ctx, user.name, jobId, trigger, cascade);
  }
  revalidatePath(orgPath(ctx.orgSlug, "/delay-cascade"));
  revalidatePath(orgPath(ctx.orgSlug, "/approvals"));
}
