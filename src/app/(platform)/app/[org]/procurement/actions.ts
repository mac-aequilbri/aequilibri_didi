"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { mulMoney } from "@/lib/platform/money";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function createProcurement(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const data = formToObject(formData);
  data.total = mulMoney(Number(data.qty) || 1, Number(data.unitPrice) || 0);
  await writeRecord(ctx, {
    table: "procurement",
    op: "create",
    data,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/procurement"));
  redirect(orgPath(ctx.orgSlug, "/procurement"));
}

const STATUSES = ["pending", "ordered", "delivered", "invoiced", "paid"];

export async function setProcurementStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = Number(formData.get("recordId"));
  const status = String(formData.get("status") ?? "");
  if (!recordId || !STATUSES.includes(status)) return;
  await writeRecord(ctx, {
    table: "procurement",
    op: "update",
    recordId,
    data: { status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/procurement"));
}
