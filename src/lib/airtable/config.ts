// Airtable migration — activation + base resolution.
//
// The whole Airtable data layer is inert unless AIRTABLE_MIGRATION=true, so it
// can land in the tree without affecting the live Postgres path. The PAT is
// read from the environment (never hard-coded; .env is gitignored).
//
// Per-customer base model: each client is its own cloned Airtable base, so a
// request must resolve to that client's baseId. The canonical home is the
// PlatOrganisation.airtableBaseId column (set at provisioning); AIRTABLE_BASES
// (a JSON object of { orgSlug: baseId }) is the legacy/override fallback, with
// the demo base as the development default.

import { prisma } from "@/lib/db";

/** Demo base (AEQUILIBRI_DIDI_DEMO) — the only base the dev PAT can reach. */
export const DEMO_BASE_ID = "appharWaojouHgMeW";

/** Master Template per the build spec — not reachable with the demo PAT yet. */
export const MASTER_TEMPLATE_BASE_ID = "appIf959oh38fgKYp";

/** Feature flag. Nothing in this layer activates unless explicitly enabled. */
export function airtableEnabled(): boolean {
  return process.env.AIRTABLE_MIGRATION === "true";
}

/** The personal access token. Throws if asked for while unset, so a
 *  misconfiguration is a loud failure rather than a silent no-op. */
export function airtablePat(): string {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    throw new Error("AIRTABLE_PAT is not set — cannot reach the Airtable API.");
  }
  return pat;
}

function baseRegistry(): Record<string, string> {
  const raw = process.env.AIRTABLE_BASES;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Resolve an org slug to its Airtable base id. Resolution order:
 *   1. the org's provisioned `airtableBaseId` column (the canonical home), then
 *   2. the AIRTABLE_BASES env map (legacy / not-yet-provisioned orgs), then
 *   3. the demo base in development.
 *  Throws in production when none match, so a misconfigured org fails loudly.
 *  The DB lookup is best-effort: if Postgres is unreachable we still fall back
 *  to the env map, and the cost is negligible next to the Airtable round-trip. */
export async function resolveBaseId(orgSlug: string): Promise<string> {
  // Control plane first: when the org registry lives in Airtable, the slug→base
  // mapping comes from there (no Postgres). Dynamic import avoids a config↔
  // control module cycle.
  const { controlEnabled, getOrgRegistry } = await import("./control");
  if (controlEnabled()) {
    const entry = await getOrgRegistry(orgSlug).catch(() => null);
    if (entry?.airtableBaseId) return entry.airtableBaseId;
  } else {
    const org = await prisma.platOrganisation
      .findUnique({ where: { slug: orgSlug }, select: { airtableBaseId: true } })
      .catch(() => null);
    if (org?.airtableBaseId) return org.airtableBaseId;
  }

  const registry = baseRegistry();
  if (registry[orgSlug]) return registry[orgSlug];
  if (process.env.NODE_ENV !== "production") return DEMO_BASE_ID;
  throw new Error(`No Airtable base mapped for org "${orgSlug}" (provision its base or set AIRTABLE_BASES).`);
}
