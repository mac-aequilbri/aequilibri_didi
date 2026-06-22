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
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordIdRaw || !["open", "accepted", "mitigated", "closed"].includes(status)) return;

  // recordWriter routes to Airtable (rec…) or Postgres (numeric) by id shape.
  await writeRecord(ctx, {
    table: "risk",
    op: "update",
    recordId: recordIdRaw,
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
  const escalate = (recordId: number | string) =>
    writeRecord(ctx, {
      table: "risk",
      op: "update",
      recordId,
      data: { escalatedAt: new Date().toISOString(), escalationNote: note },
      actor: { type: "human", name: user.name },
    });

  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "RISKS", { maxRecords: 500 });
    for (const r of rows) {
      if (String(r["Status"] ?? "") !== "open" || r["Escalated_At"]) continue;
      if ((Number(r["Likelihood"]) || 0) * (Number(r["Impact"]) || 0) < threshold) continue;
      await escalate(r.id);
    }
  } else {
    const risks = await prisma.platConRisk.findMany({
      where: { orgId: ctx.orgId, status: "open", escalatedAt: null },
    });
    for (const r of risks) {
      if (r.likelihood * r.impact < threshold) continue;
      await escalate(r.id);
    }
  }
  revalidatePath(orgPath(ctx.orgSlug, "/risks"));
  redirect(orgPath(ctx.orgSlug, "/risks"));
}
