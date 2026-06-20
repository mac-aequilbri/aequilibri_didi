"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function createRisk(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const data = formToObject(formData);

  if (airtableEnabled()) {
    await core.create(ctx.orgSlug, "RISKS", {
      Risk: String(data.description ?? "").slice(0, 200) || "Untitled risk",
      Likelihood: Number(data.likelihood) || 3,
      Impact: Number(data.impact) || 3,
      Mitigation: String(data.mitigation ?? ""),
      Owner: String(data.owner ?? ""),
      Status: "open",
    });
    revalidatePath(orgPath(ctx.orgSlug, "/risks"));
    redirect(orgPath(ctx.orgSlug, "/risks"));
  }

  await writeRecord(ctx, {
    table: "risk",
    op: "create",
    data,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/risks"));
  redirect(orgPath(ctx.orgSlug, "/risks"));
}

export async function setRiskStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordIdRaw || !["open", "accepted", "mitigated", "closed"].includes(status)) return;

  if (airtableEnabled()) {
    // RISKS Status values match the app's, so no remapping needed.
    if (recordIdRaw.startsWith("rec")) {
      await core.update(ctx.orgSlug, "RISKS", recordIdRaw, { Status: status });
    }
    revalidatePath(orgPath(ctx.orgSlug, "/risks"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
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
