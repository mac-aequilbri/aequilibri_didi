"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function createCashflowEntry(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  await writeRecord(ctx, {
    table: "cashflow",
    op: "create",
    data: formToObject(formData),
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/cashflow"));
  redirect(orgPath(ctx.orgSlug, "/cashflow"));
}

export async function updateCashflowActual(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const actual = Number(formData.get("actual"));
  if (!recordIdRaw || !Number.isFinite(actual)) return;

  if (airtableEnabled()) {
    if (recordIdRaw.startsWith("rec")) {
      await core.update(ctx.orgSlug, "CASHFLOW", recordIdRaw, { Actual: actual });
    }
    revalidatePath(orgPath(ctx.orgSlug, "/cashflow"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "cashflow",
    op: "update",
    recordId,
    data: { actual },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/cashflow"));
}
