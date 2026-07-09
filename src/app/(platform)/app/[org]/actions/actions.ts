"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { STATUS_MAP_REF_TYPE, isAppStatus, normStatusKey } from "@/lib/platform/actionStatus";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function createActionItem(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate

  await writeRecord(ctx, {
    table: "action",
    op: "create",
    data: formToObject(formData),
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
  redirect(orgPath(ctx.orgSlug, "/actions"));
}

export async function updateActionStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordIdRaw || !status) return;

  // recordWriter routes to Airtable (rec…) or Postgres (numeric) by id shape.
  await writeRecord(ctx, {
    table: "action",
    op: "update",
    recordId: recordIdRaw,
    data: { status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
}

/** Save (or update) a per-org raw→canonical action-status mapping. This is the
 *  non-destructive cleanup for migrated bases: it records how to interpret an
 *  unrecognised Status value, never touching the ISSUES rows themselves. Stored
 *  as a PLAT_CFG_REFERENCE row (Ref_Type=action_status_map). */
export async function saveStatusMapping(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx); // enforces the write gate
  const raw = String(formData.get("raw") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!raw || !isAppStatus(status)) return;
  const code = normStatusKey(raw);

  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "PLAT_CFG_REFERENCE", { maxRecords: 500 });
    const existing = rows.find(
      (r) => str(r["Ref_Type"]) === STATUS_MAP_REF_TYPE && str(r["Code"]) === code,
    );
    const fields = {
      Name: raw,
      Ref_Type: STATUS_MAP_REF_TYPE,
      Code: code,
      Value: status,
      Is_Active: true,
    };
    if (existing) await core.update(ctx.orgSlug, "PLAT_CFG_REFERENCE", existing.id, fields);
    else await core.create(ctx.orgSlug, "PLAT_CFG_REFERENCE", fields);
  } else {
    const existing = await prisma.platCfgReference.findFirst({
      where: { orgId: ctx.orgId, type: STATUS_MAP_REF_TYPE, code },
    });
    if (existing) {
      await prisma.platCfgReference.update({
        where: { id: existing.id },
        data: { value: status, name: raw, isActive: true },
      });
    } else {
      await prisma.platCfgReference.create({
        data: { orgId: ctx.orgId, type: STATUS_MAP_REF_TYPE, code, name: raw, value: status, sortOrder: 0 },
      });
    }
  }
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
  revalidatePath(orgPath(ctx.orgSlug)); // dashboard shares the definition
}
