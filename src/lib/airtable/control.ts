// Airtable control plane — the org registry that lets the platform run without
// Postgres. The per-customer bases hold a client's data, but resolving a slug
// to its base and authenticating a user are bootstrap steps that can't live in
// a per-customer base (chicken-and-egg). They live in a single shared CONTROL
// base instead:
//   PLAT_ORG_REGISTRY — one row per org (slug → orgId, baseId, settings, …)
//   PLAT_TEAM         — members (orgSlug, email, role) for auth
//
// Activation is gated on AIRTABLE_CONTROL_BASE_ID (plus AIRTABLE_MIGRATION):
// when it's unset the whole module is inert and the platform keeps reading org
// identity from Postgres exactly as before. Tables are addressed by NAME (the
// client URL-encodes them) and the control base id comes from the environment,
// never resolved (it would be circular).

import { createRecords, listRecords } from "./client";
import { airtableEnabled } from "./config";

const S = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const N = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

const REGISTRY = "PLAT_ORG_REGISTRY";
const TEAM = "PLAT_TEAM";

/** The shared control base id, or null when not configured. */
export function controlBaseId(): string | null {
  return process.env.AIRTABLE_CONTROL_BASE_ID || null;
}

/** Whether the org registry lives in Airtable (vs Postgres). */
export function controlEnabled(): boolean {
  return airtableEnabled() && !!controlBaseId();
}

export interface OrgRegistryEntry {
  recordId: string;
  orgId: number;
  slug: string;
  name: string;
  vertical: string;
  defaultEngagementType: string;
  /** JSON array string, e.g. '["long_project"]'. */
  allowedEngagementTypes: string;
  aiAuthority: string;
  /** JSON object string (assistant + features). */
  settings: string;
  airtableBaseId: string | null;
  isActive: boolean;
}

export interface ControlTeamMember {
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

/** Single-quote is the only char that breaks an Airtable formula string; org
 *  slugs can't contain it (SLUG_RE), but strip it defensively for emails. */
const formulaSafe = (v: string): string => v.replace(/'/g, "");

function toEntry(r: { id: string; fields: Record<string, unknown> }): OrgRegistryEntry {
  const f = r.fields;
  return {
    recordId: r.id,
    orgId: N(f["Org_Id"]),
    slug: S(f["Slug"]),
    name: S(f["Name"]),
    vertical: S(f["Vertical"]) || "construction",
    defaultEngagementType: S(f["Default_Engagement_Type"]) || "long_project",
    allowedEngagementTypes: S(f["Allowed_Engagement_Types"]) || "[]",
    aiAuthority: S(f["Ai_Authority"]) || "approve_required",
    settings: S(f["Settings"]) || "{}",
    airtableBaseId: S(f["Airtable_Base_Id"]) || null,
    isActive: f["Is_Active"] !== false,
  };
}

/** All active orgs (org picker, scheduler). Empty when control is off. */
export async function listOrgRegistry(): Promise<OrgRegistryEntry[]> {
  const base = controlBaseId();
  if (!base) return [];
  const recs = await listRecords(base, REGISTRY, { maxRecords: 1000 });
  return recs.map(toEntry).filter((e) => e.slug && e.isActive);
}

/** Resolve one org by slug, or null. */
export async function getOrgRegistry(slug: string): Promise<OrgRegistryEntry | null> {
  const base = controlBaseId();
  if (!base) return null;
  const recs = await listRecords(base, REGISTRY, {
    filterByFormula: `{Slug}='${formulaSafe(slug)}'`,
    maxRecords: 1,
  });
  return recs.length ? toEntry(recs[0]) : null;
}

/** Active team members for an org (auth). */
export async function listControlTeam(slug: string): Promise<ControlTeamMember[]> {
  const base = controlBaseId();
  if (!base) return [];
  const recs = await listRecords(base, TEAM, {
    filterByFormula: `{Org_Slug}='${formulaSafe(slug)}'`,
    maxRecords: 500,
  });
  return recs
    .map((r) => {
      const f = r.fields;
      return {
        name: S(f["Name"]),
        email: S(f["Email"]),
        role: S(f["Role"]) || "admin",
        isActive: f["Is_Active"] !== false,
      };
    })
    .filter((m) => m.isActive);
}

/** Next org id: max existing + 1 (the registry replaces the Postgres
 *  autoincrement). Count-based numbering can dup after deletes, like the rest
 *  of the Airtable id allocation — tolerated at onboarding volumes. */
export async function nextOrgId(): Promise<number> {
  const base = controlBaseId();
  if (!base) return 1;
  const recs = await listRecords(base, REGISTRY, { maxRecords: 1000 });
  return recs.reduce((m, r) => Math.max(m, N(r.fields["Org_Id"])), 0) + 1;
}

export interface NewOrgRegistry {
  slug: string;
  name: string;
  vertical: string;
  defaultEngagementType: string;
  allowedEngagementTypes: string;
  aiAuthority: string;
  settings: string;
  airtableBaseId: string | null;
}

/** Register a new org in the control base; returns its allocated orgId. */
export async function createOrgRegistry(entry: NewOrgRegistry): Promise<number> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  const orgId = await nextOrgId();
  await createRecords(base, REGISTRY, [
    {
      Slug: entry.slug,
      Org_Id: orgId,
      Name: entry.name,
      Vertical: entry.vertical,
      Default_Engagement_Type: entry.defaultEngagementType,
      Allowed_Engagement_Types: entry.allowedEngagementTypes,
      Ai_Authority: entry.aiAuthority,
      Settings: entry.settings,
      Airtable_Base_Id: entry.airtableBaseId ?? "",
      Is_Active: true,
    },
  ]);
  return orgId;
}

/** Add a team member to the control base. */
export async function createControlTeamMember(
  slug: string,
  member: { name: string; email: string; role: string },
): Promise<void> {
  const base = controlBaseId();
  if (!base) return;
  await createRecords(base, TEAM, [
    {
      Name: member.name,
      Org_Slug: slug,
      Email: member.email,
      Role: member.role,
      Is_Active: true,
    },
  ]);
}
