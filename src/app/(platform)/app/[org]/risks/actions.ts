"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function createRisk(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  await writeRecord(ctx, {
    table: "risk",
    op: "create",
    data: formToObject(formData),
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/risks"));
  redirect(orgPath(ctx.orgSlug, "/risks"));
}

export async function setRiskStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = Number(formData.get("recordId"));
  const status = String(formData.get("status") ?? "");
  if (!recordId || !["open", "accepted", "mitigated", "closed"].includes(status)) return;
  await writeRecord(ctx, {
    table: "risk",
    op: "update",
    recordId,
    data: { status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/risks"));
}

/** Escalate every open risk whose likelihood×impact meets the threshold. */
export async function escalateHighRisks(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const threshold = Math.max(1, Number(formData.get("threshold")) || 12);
  const note = String(formData.get("note") ?? "").trim() || `Score ≥ ${threshold} batch escalation.`;

  const risks = await prisma.platConRisk.findMany({
    where: { orgId: ctx.orgId, status: "open", escalatedAt: null },
  });
  for (const r of risks) {
    if (r.likelihood * r.impact < threshold) continue;
    await writeRecord(ctx, {
      table: "risk",
      op: "update",
      recordId: r.id,
      data: { escalatedAt: new Date().toISOString(), escalationNote: note },
      actor: { type: "human", name: user.name },
    });
  }
  revalidatePath(orgPath(ctx.orgSlug, "/risks"));
  redirect(orgPath(ctx.orgSlug, "/risks"));
}
