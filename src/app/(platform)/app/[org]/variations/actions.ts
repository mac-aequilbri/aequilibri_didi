"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam, writeRecord } from "@/lib/platform/recordWriter";
import {
  aiDraftVariation,
  approveVariation,
  rejectVariation,
} from "@/services/platform/construction/variations";

export async function createVariation(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const data = formToObject(formData);
  data.submittedBy = user.name;
  data.status = "submitted";
  try {
    await writeRecord(ctx, {
      table: "variation_order",
      op: "create",
      data,
      actor: { type: "human", name: user.name },
    });
  } catch (e) {
    console.error("[createVariation] write rejected:", e);
    redirect(orgPath(ctx.orgSlug, "/variations/new?error=save_failed"));
  }
  revalidatePath(orgPath(ctx.orgSlug, "/variations"));
  redirect(orgPath(ctx.orgSlug, "/variations"));
}

export async function aiDraftVariationAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const jobId = recordIdParam(formData.get("jobId"));
  const brief = String(formData.get("brief") ?? "").trim();
  if (jobId == null || !brief) return;
  let id;
  try {
    ({ id } = await aiDraftVariation(ctx, ctx.config.assistant.name, jobId, brief));
  } catch (e) {
    console.error("[aiDraftVariationAction] draft rejected:", e);
    redirect(orgPath(ctx.orgSlug, "/variations/new?error=save_failed"));
  }
  revalidatePath(orgPath(ctx.orgSlug, "/variations"));
  redirect(orgPath(ctx.orgSlug, id ? `/variations/${id}` : "/variations"));
}

export async function approveVariationAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const id = recordIdParam(formData.get("recordId"));
  if (id == null) return;
  const costRaw = formData.get("costImpact");
  const daysRaw = formData.get("timeImpactDays");
  await approveVariation(ctx, user.name, id, {
    costImpact: costRaw !== null && costRaw !== "" ? Number(costRaw) : undefined,
    timeImpactDays: daysRaw !== null && daysRaw !== "" ? Number(daysRaw) : undefined,
  });
  revalidatePath(orgPath(ctx.orgSlug, `/variations/${id}`));
  revalidatePath(orgPath(ctx.orgSlug, "/variations"));
}

export async function rejectVariationAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const id = recordIdParam(formData.get("recordId"));
  if (id == null) return;
  await rejectVariation(ctx, user.name, id);
  revalidatePath(orgPath(ctx.orgSlug, `/variations/${id}`));
  revalidatePath(orgPath(ctx.orgSlug, "/variations"));
}
