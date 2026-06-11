"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function createDecision(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const data = formToObject(formData);
  data.madeBy = data.madeBy || user.name;
  await writeRecord(ctx, {
    table: "decision",
    op: "create",
    data,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/decisions"));
  redirect(orgPath(ctx.orgSlug, "/decisions"));
}

export async function setDecisionStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = Number(formData.get("recordId"));
  const status = String(formData.get("status") ?? "");
  if (!recordId || !["proposed", "confirmed", "superseded"].includes(status)) return;
  await writeRecord(ctx, {
    table: "decision",
    op: "update",
    recordId,
    data: { status, ...(status === "confirmed" ? { decidedAt: new Date().toISOString() } : {}) },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/decisions"));
}
