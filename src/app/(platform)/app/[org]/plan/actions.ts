"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

// Canonical PLAN.Status vocabulary (vocab.ts) — the inline setter posts these.
const PLAN_STATUSES = ["Not Started", "In Progress", "Complete", "Blocked", "Deferred"];

export async function createPlanTask(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate

  try {
    await writeRecord(ctx, {
      table: "plan",
      op: "create",
      data: formToObject(formData),
      actor: { type: "human", name: user.name },
    });
  } catch (e) {
    console.error("[createPlanTask] write rejected:", e);
    redirect(orgPath(ctx.orgSlug, "/plan/new?error=save_failed"));
  }
  revalidatePath(orgPath(ctx.orgSlug, "/plan"));
  redirect(orgPath(ctx.orgSlug, "/plan"));
}

export async function setPlanTaskStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordId || !PLAN_STATUSES.includes(status)) return;

  await writeRecord(ctx, {
    table: "plan",
    op: "update",
    recordId,
    data: { status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/plan"));
}
