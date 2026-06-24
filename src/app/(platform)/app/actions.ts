"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { controlEnabled, deleteOrgFromRegistry } from "@/lib/airtable/control";
import { prisma } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform/org-context";

// Offboard a client: remove it from the org registry so it disappears from the
// picker (and stops erroring when clicked). Admin-gated. The per-customer
// Airtable base is NOT deleted — Airtable has no base-delete API — so the base
// id is surfaced for manual removal in the Airtable UI.
export async function deleteOrgAction(formData: FormData): Promise<void> {
  if (!(await isPlatformAdmin())) {
    redirect("/app?denied=admin");
  }
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    redirect("/app");
  }

  let baseId: string | null = null;
  if (controlEnabled()) {
    const result = await deleteOrgFromRegistry(slug);
    baseId = result.baseId;
  } else {
    // Postgres mode: soft-deactivate (the picker filters on isActive) to avoid
    // cascading hard deletes across the org's data.
    await prisma.platOrganisation.updateMany({ where: { slug }, data: { isActive: false } });
  }

  revalidatePath("/app");
  redirect(`/app?deleted=${encodeURIComponent(slug)}${baseId ? `&base=${encodeURIComponent(baseId)}` : ""}`);
}
