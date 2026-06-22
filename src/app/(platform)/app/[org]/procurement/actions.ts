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
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const data = formToObject(formData);
  const qty = Number(data.qty) || 1;
  const unitPrice = Number(data.unitPrice) || 0;
  data.total = mulMoney(qty, unitPrice);

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
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordIdRaw || !STATUSES.includes(status)) return;

  // recordWriter routes to Airtable (rec…) or Postgres (numeric) by id shape.
  await writeRecord(ctx, {
    table: "procurement",
    op: "update",
    recordId: recordIdRaw,
    data: { status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/procurement"));
}
