// Airtable migration — activation + base resolution.
//
// The whole Airtable data layer is inert unless AIRTABLE_MIGRATION=true, so it
// can land in the tree without affecting the live Postgres path. The PAT is
// read from the environment (never hard-coded; .env is gitignored).
//
// Per-customer base model: each client is its own cloned Airtable base, so a
// request must resolve to that client's baseId. The long-term home for this is
// a PlatOrganisation.airtableBaseId column; until that exists, the mapping is
// driven by AIRTABLE_BASES (a JSON object of { orgSlug: baseId }), with the
// demo base as the development default.

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

/** Resolve an org slug to its Airtable base id. Falls back to the demo base in
 *  development so the spike runs without configuration. */
export function resolveBaseId(orgSlug: string): string {
  const registry = baseRegistry();
  if (registry[orgSlug]) return registry[orgSlug];
  if (process.env.NODE_ENV !== "production") return DEMO_BASE_ID;
  throw new Error(`No Airtable base mapped for org "${orgSlug}" (set AIRTABLE_BASES).`);
}
