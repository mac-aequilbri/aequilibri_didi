"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";
import {
  promoteHypothesisToRule,
  runHypothesisEngine,
  setHypothesisStatus,
  snapshotIntelligence,
} from "@/services/platform/learning";

export async function runEngineAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await runHypothesisEngine(ctx);
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

export async function promoteHypothesisAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const id = Number(formData.get("hypothesisId"));
  const kind = String(formData.get("kind") ?? "adjustment") as "adjustment" | "guidance";
  if (id) await promoteHypothesisToRule(ctx, id, kind);
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

export async function rejectHypothesisAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const id = Number(formData.get("hypothesisId"));
  if (id) await setHypothesisStatus(ctx, id, "rejected");
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = Number(formData.get("recordId"));
  const isActive = formData.get("isActive") === "true";
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "learning_rule",
    op: "update",
    recordId,
    data: { isActive },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

export async function snapshotAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await snapshotIntelligence(ctx);
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}
