"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { analyzeDelayCascade } from "@/services/platform/construction/delay";

export async function runDelayCascade(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = Number(formData.get("jobId"));
  const trigger = String(formData.get("trigger") ?? "").trim();
  const delayDays = Number(formData.get("delayDays")) || 0;
  if (!jobId || !trigger || delayDays <= 0) return;
  await analyzeDelayCascade(ctx, user.name, jobId, trigger, delayDays);
  revalidatePath(orgPath(ctx.orgSlug, "/delay-cascade"));
}
