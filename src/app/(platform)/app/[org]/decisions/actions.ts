"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function createDecision(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const data = formToObject(formData);
  data.madeBy = data.madeBy || user.name;

  try {
    await writeRecord(ctx, {
      table: "decision",
      op: "create",
      data,
      actor: { type: "human", name: user.name },
    });
  } catch (e) {
    console.error("[createDecision] write rejected:", e);
    redirect(orgPath(ctx.orgSlug, "/decisions/new?error=save_failed"));
  }
  revalidatePath(orgPath(ctx.orgSlug, "/decisions"));
  redirect(orgPath(ctx.orgSlug, "/decisions"));
}

export async function setDecisionStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordIdRaw || !["proposed", "confirmed", "superseded"].includes(status)) return;

  // recordWriter routes to Airtable (rec…) or Postgres (numeric) by id shape.
  await writeRecord(ctx, {
    table: "decision",
    op: "update",
    recordId: recordIdRaw,
    data: { status, ...(status === "confirmed" ? { decidedAt: new Date().toISOString() } : {}) },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/decisions"));
}
