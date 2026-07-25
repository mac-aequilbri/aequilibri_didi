"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { requireFinancialAccess, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";
import type { CreateFormState } from "@/components/form/CreateForm";

export async function createBudgetLine(_prev: CreateFormState, formData: FormData): Promise<CreateFormState> {
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
    return { error: "Couldn't save the budget line — nothing was recorded. The org's base rejected the write; check the server log for details." };
  }
  revalidatePath(orgPath(ctx.orgSlug, "/budget"));
  redirect(orgPath(ctx.orgSlug, "/budget"));
}
