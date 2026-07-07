"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  controlEnabled,
  deleteOrgFromRegistry,
  listControlTeam,
  saveMetricsSnapshot,
} from "@/lib/airtable/control";
import { prisma } from "@/lib/db";
import { getAuthEmail, getOrgCtx, isPlatformAdmin } from "@/lib/platform/org-context";
import { loadOrgHighlights, type OrgHighlights } from "@/lib/platform/orgHighlightsSource";

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

// Per-card highlights for the client picker. The picker renders the cached
// snapshot from the control base instantly (see readMetricsSnapshot); this
// action is the refresh path — called by the card only when its cache is
// missing or past the TTL. It recomputes from the org's own base and writes the
// result back to the control base (write-through) so the next picker load is a
// pure control-base read again. Gated by the same membership check the picker
// uses: a signed-in user may only read orgs they belong to; demo mode sees all.
export async function fetchOrgHighlights(slug: string): Promise<OrgHighlights | null> {
  const clean = slug.trim();
  if (!clean) return null;

  const ctx = await getOrgCtx(clean);
  if (!ctx) return null;

  const email = await getAuthEmail();
  if (email !== null) {
    const emails = controlEnabled()
      ? (await listControlTeam(clean)).map((m) => m.email.toLowerCase())
      : (
          await prisma.platCfgTeamMember.findMany({
            where: { orgId: ctx.orgId, isActive: true },
            select: { email: true },
          })
        ).map((m) => m.email.toLowerCase());
    if (!emails.includes(email)) return null;
  }

  const highlights = await loadOrgHighlights(ctx);

  // Write-through: refresh the control-base cache so the next picker load is a
  // pure control-base read. Best-effort — the caller still gets fresh numbers
  // even if the cache write fails.
  if (controlEnabled()) {
    try {
      await saveMetricsSnapshot(clean, { ...highlights, at: new Date().toISOString() });
    } catch {
      /* cache is an optimisation; never fail the read on a write miss */
    }
  }

  return highlights;
}
