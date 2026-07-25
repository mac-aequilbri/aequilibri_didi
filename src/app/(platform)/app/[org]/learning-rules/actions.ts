"use server";

import { revalidatePath } from "next/cache";
import { seedCascadeRules } from "@/lib/platform/cascade";
import { getCurrentUser, requireAdmin, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam, writeRecord } from "@/lib/platform/recordWriter";
import {
  promoteHypothesisToRule,
  runHypothesisEngine,
  setHypothesisStatus,
  setRuleOverrideLevel,
  snapshotIntelligence,
  type OverrideLevel,
} from "@/services/platform/learning";

export async function runEngineAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx); // write gate — read-only roles cannot run the engine
  await runHypothesisEngine(ctx);
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

export async function promoteHypothesisAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx); // write gate
  const id = recordIdParam(formData.get("hypothesisId"));
  const kind = String(formData.get("kind") ?? "adjustment") as "adjustment" | "guidance";
  if (id != null) await promoteHypothesisToRule(ctx, id, kind);
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

export async function rejectHypothesisAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx); // write gate
  const id = recordIdParam(formData.get("hypothesisId"));
  if (id != null) await setHypothesisStatus(ctx, id, "rejected");
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = recordIdParam(formData.get("recordId"));
  const isActive = formData.get("isActive") === "true";
  if (recordId == null) return;
  await writeRecord(ctx, {
    table: "learning_rule",
    op: "update",
    recordId,
    data: { isActive },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

/** Owner-set governance level (Spec 12 Override_Permission ladder) — e.g.
 *  relaxing an Owner_Only rule to Standard after 10 clean applications. */
export async function setOverrideLevelAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await requireAdmin(ctx); // governance changes are owner-only
  const recordId = String(formData.get("recordId") ?? "");
  const level = String(formData.get("level") ?? "");
  if (!recordId || !["owner_only", "standard", "advisory"].includes(level)) return;
  await setRuleOverrideLevel(ctx, recordId, level as OverrideLevel);
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

/** Idempotently seed the 7 Spec 12 cascade rules (existing orgs predate the
 *  onboarding seed). Advisory rules land Active; write-effect rules land as
 *  Drafts for the owner to activate (lock decision D-4). */
export async function seedCascadeRulesAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await requireAdmin(ctx);
  await seedCascadeRules(ctx);
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}

export async function snapshotAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx); // write gate
  await snapshotIntelligence(ctx);
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
}
