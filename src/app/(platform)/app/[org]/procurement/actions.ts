"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
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

  if (airtableEnabled()) {
    const fields: Record<string, unknown> = {
      Item: String(data.item ?? "").slice(0, 300) || "Untitled item",
      Category: String(data.category ?? ""),
      Vendor_Name: String(data.vendorName ?? ""),
      Qty: qty,
      Unit_Price: unitPrice,
      Total: Number(data.total) || 0,
      Status: "pending",
    };
    if (data.dueDate) fields["Due_Date"] = String(data.dueDate);
    await core.create(ctx.orgSlug, "PROCUREMENT", fields);
    revalidatePath(orgPath(ctx.orgSlug, "/procurement"));
    redirect(orgPath(ctx.orgSlug, "/procurement"));
  }

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

  if (airtableEnabled()) {
    // typecast on write auto-creates any missing select option.
    if (recordIdRaw.startsWith("rec")) {
      await core.update(ctx.orgSlug, "PROCUREMENT", recordIdRaw, { Status: status });
    }
    revalidatePath(orgPath(ctx.orgSlug, "/procurement"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "procurement",
    op: "update",
    recordId,
    data: { status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/procurement"));
}
