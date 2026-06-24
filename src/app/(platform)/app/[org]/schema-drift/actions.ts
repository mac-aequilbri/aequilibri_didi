"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled } from "@/lib/airtable/config";
import { migrateBaseToTemplate } from "@/lib/airtable/provision";
import { requireAdmin, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { listManagedBaseIds } from "@/lib/platform/schemaDriftSource";

// Bring a drifting customer base up to the template schema. Admin-gated, and
// guarded so only a base the platform manages can be targeted. Additive only
// (migrateBaseToTemplate never deletes), so it is safe to re-run.
export async function migrateBaseAction(formData: FormData): Promise<void> {
  const org = String(formData.get("org") ?? "");
  const baseId = String(formData.get("baseId") ?? "").trim();
  const ctx = await requireOrgCtx(org);
  await requireAdmin(ctx);

  const back = (qs: string) => orgPath(ctx.orgSlug, `/schema-drift?${qs}`);

  if (!airtableEnabled() || !baseId) {
    redirect(back("status=unavailable"));
  }

  const managed = await listManagedBaseIds();
  if (!managed.has(baseId)) {
    redirect(back("status=unknown_base"));
  }

  const result = await migrateBaseToTemplate(baseId);
  const applied =
    result.createdTables.length + result.addedFields.length + result.createdLinks.length;
  const status = result.errors.length ? "partial" : result.changed ? "ok" : "noop";

  revalidatePath(orgPath(ctx.orgSlug, "/schema-drift"));
  redirect(back(`migrated=${encodeURIComponent(baseId)}&applied=${applied}&status=${status}`));
}
