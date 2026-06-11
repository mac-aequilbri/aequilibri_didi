"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function approvePhase(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = Number(formData.get("recordId"));
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "phase",
    op: "update",
    recordId,
    data: { isAiDraft: false, approvedBy: user.name },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}

export async function rejectPhase(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = Number(formData.get("recordId"));
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "phase",
    op: "delete",
    recordId,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}

export async function setPhaseProgress(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = Number(formData.get("recordId"));
  const completionPct = Number(formData.get("completionPct"));
  if (!recordId || !Number.isFinite(completionPct)) return;
  const status = completionPct >= 100 ? "complete" : completionPct > 0 ? "in_progress" : "pending";
  await writeRecord(ctx, {
    table: "phase",
    op: "update",
    recordId,
    data: { completionPct: Math.max(0, Math.min(100, completionPct)), status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}
