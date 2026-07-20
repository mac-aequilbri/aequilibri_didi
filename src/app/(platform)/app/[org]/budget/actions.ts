"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { requireFinancialAccess, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function createBudgetLine(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await requireFinancialAccess(ctx);
  try {
    await writeRecord(ctx, {
      table: "budget_line",
      op: "create",
      data: formToObject(formData),
      actor: { type: "human", name: user.name },
    });
  } catch (e) {
    console.error("[createBudgetLine] write rejected:", e);
    redirect(orgPath(ctx.orgSlug, "/budget/new?error=save_failed"));
  }
  revalidatePath(orgPath(ctx.orgSlug, "/budget"));
  redirect(orgPath(ctx.orgSlug, "/budget"));
}
