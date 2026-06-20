"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function createBudgetLine(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  await writeRecord(ctx, {
    table: "budget_line",
    op: "create",
    data: formToObject(formData),
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/budget"));
  redirect(orgPath(ctx.orgSlug, "/budget"));
}

export async function updateBudgetActual(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const actualAmount = Number(formData.get("actualAmount"));
  if (!recordIdRaw || !Number.isFinite(actualAmount)) return;

  if (airtableEnabled()) {
    if (recordIdRaw.startsWith("rec")) {
      await core.update(ctx.orgSlug, "BUDGET", recordIdRaw, { Actual_Amount: actualAmount });
    }
    revalidatePath(orgPath(ctx.orgSlug, "/budget"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "budget_line",
    op: "update",
    recordId,
    data: { actualAmount },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/budget"));
}
