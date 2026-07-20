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

import { createRecords, deleteRecords, getRecord, listRecords, updateRecords } from "./client";
import { airtableEnabled } from "./config";
import { TtlCache } from "./ttlCache";

// Registry rows and team lists are read on every page, action, and data-layer
// call (resolveBaseId goes through getOrgRegistry), but change rarely. A short
// TTL plus explicit invalidation on the write paths below removes an Airtable
// round-trip from nearly every request. Staleness bound: edits made directly
// in the Airtable UI (or by another server instance) take up to TTL_MS to be
// seen — including member deactivation, which is why the TTL stays short.
const CONTROL_TTL_MS = 60_000;
const orgRegistryCache = new TtlCache<OrgRegistryEntry | null>(CONTROL_TTL_MS);
const teamCache = new TtlCache<ControlTeamMember[]>(CONTROL_TTL_MS);

/** Drop cached control-plane rows for a slug. Exported for out-of-band writes
 *  (e.g. provisioning scripts) — control.ts's own write paths call it already. */
export function invalidateControlCache(slug: string): void {
  orgRegistryCache.delete(slug);
  teamCache.delete(slug);
}

const S = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const N = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

const REGISTRY = "PLAT_ORG_REGISTRY";
const TEAM = "PLAT_TEAM";
const TEMPLATE_REGISTRY = "PLAT_TEMPLATE_REGISTRY";
const JOB_CATALOG = "PLAT_JOB_CATALOG";
const CONNECTIONS = "PLAT_CONNECTIONS";
const REPORT_CATALOG_TBL = "PLAT_REPORT_CATALOG";
const OUTBOX = "PLAT_OUTBOX";

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

/** Denormalised org counts, cached on the org's registry row so the org picker
 *  cards AND the sidebar nav badges can render without touching each customer
 *  base. `at` is the ISO time the snapshot was computed — readers treat it as
 *  stale past their own TTL and refresh it (write-through). Lives inside the
 *  Settings JSON (alongside branding) so no control-base schema change is
 *  needed. */
export interface OrgMetricsSnapshot {
  projects: number;
  openActions: number;
  overdueActions: number;
  pendingApprovals: number;
  openRisks: number;
  openVariations: number;
  at: string;
}

/** Pull the cached metrics snapshot out of a registry row's Settings JSON, or
 *  null when absent/malformed. Fields a pre-upgrade writer didn't know about
 *  read as 0 — bounded by the reader's TTL, since every current writer stores
 *  the full shape. */
export function readMetricsSnapshot(settingsRaw: string): OrgMetricsSnapshot | null {
  try {
    const m = (JSON.parse(settingsRaw) as { metrics?: Partial<OrgMetricsSnapshot> })?.metrics;
    if (!m || typeof m.at !== "string") return null;
    return {
      projects: N(m.projects),
      openActions: N(m.openActions),
      overdueActions: N(m.overdueActions),
      pendingApprovals: N(m.pendingApprovals),
      openRisks: N(m.openRisks),
      openVariations: N(m.openVariations),
      at: m.at,
    };
  } catch {
    return null;
  }
}

/** Write (merge) the metrics snapshot into an org's Settings JSON, preserving
 *  the rest of the config (branding, assistant, features). No-op when control
 *  is off or the slug is unknown. Best-effort by design — a picker refresh must
 *  never fail because the cache write failed. */
export async function saveMetricsSnapshot(slug: string, metrics: OrgMetricsSnapshot): Promise<void> {
  const base = controlBaseId();
  if (!base) return;
  const recs = await listRecords(base, REGISTRY, {
    filterByFormula: `{Slug}='${formulaSafe(slug)}'`,
    maxRecords: 1,
  });
  if (!recs.length) return;
  let settings: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(S(recs[0].fields["Settings"]) || "{}");
    if (parsed && typeof parsed === "object") settings = parsed as Record<string, unknown>;
  } catch {
    /* start from empty on malformed settings rather than clobbering nothing */
  }
  settings.metrics = metrics;
  await updateRecords(base, REGISTRY, [{ id: recs[0].id, fields: { Settings: JSON.stringify(settings) } }]);
  orgRegistryCache.delete(slug);
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

/** Resolve one org by slug, or null. Cached (TTL + write invalidation) — this
 *  sits under resolveBaseId and requireOrgCtx, i.e. under everything. */
export async function getOrgRegistry(slug: string): Promise<OrgRegistryEntry | null> {
  const base = controlBaseId();
  if (!base) return null;
  return orgRegistryCache.get(slug, async () => {
    const recs = await listRecords(base, REGISTRY, {
      filterByFormula: `{Slug}='${formulaSafe(slug)}'`,
      maxRecords: 1,
    });
    return recs.length ? toEntry(recs[0]) : null;
  });
}

/** Per-org webhook signing secret (inbound integration HMAC), kept in the
 *  registry row's Settings JSON alongside branding/metrics. Null when control
 *  is off or unset — callers fall back to the global PLATFORM_WEBHOOK_SECRET. */
export async function getOrgWebhookSecret(slug: string): Promise<string | null> {
  const entry = await getOrgRegistry(slug);
  if (!entry) return null;
  try {
    const parsed = JSON.parse(entry.settings || "{}") as { webhookSecret?: unknown };
    return typeof parsed.webhookSecret === "string" && parsed.webhookSecret ? parsed.webhookSecret : null;
  } catch {
    return null;
  }
}

/** Set (merge) an org's webhook signing secret into its Settings JSON, leaving
 *  the rest of the config intact. No-op when control is off or slug unknown. */
export async function setOrgWebhookSecret(slug: string, secret: string): Promise<void> {
  const base = controlBaseId();
  if (!base) return;
  const recs = await listRecords(base, REGISTRY, {
    filterByFormula: `{Slug}='${formulaSafe(slug)}'`,
    maxRecords: 1,
  });
  if (!recs.length) return;
  let settings: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(S(recs[0].fields["Settings"]) || "{}");
    if (parsed && typeof parsed === "object") settings = parsed as Record<string, unknown>;
  } catch {
    /* start from empty on malformed settings rather than clobbering */
  }
  settings.webhookSecret = secret;
  await updateRecords(base, REGISTRY, [{ id: recs[0].id, fields: { Settings: JSON.stringify(settings) } }]);
  orgRegistryCache.delete(slug);
}

// ── PLAT_CONNECTIONS — per-org integration registry (Module 2 push channels) ──

export type ConnectionDirection = "in" | "out";

export interface ConnectionEntry {
  recordId: string;
  orgSlug: string;
  channel: string;
  direction: ConnectionDirection;
  isActive: boolean;
  eventFilter: string;
  credentialRef: string;
  lastEventAt: string;
  lastStatus: string;
  notes: string;
}

export interface NewConnection {
  orgSlug: string;
  channel: string;
  direction: ConnectionDirection;
  eventFilter?: string;
  credentialRef?: string;
  notes?: string;
}

/** Stable identity for a connection row: one per (org, channel, direction). */
export function connectionKey(orgSlug: string, channel: string, direction: string): string {
  return `${orgSlug}:${channel}:${direction}`;
}

function toConnectionEntry(r: { id: string; fields: Record<string, unknown> }): ConnectionEntry {
  const f = r.fields;
  return {
    recordId: r.id,
    orgSlug: S(f["Org_Slug"]),
    channel: S(f["Channel"]),
    direction: S(f["Direction"]) === "out" ? "out" : "in",
    isActive: f["Is_Active"] !== false,
    eventFilter: S(f["Event_Filter"]),
    credentialRef: S(f["Credential_Ref"]),
    lastEventAt: S(f["Last_Event_At"]),
    lastStatus: S(f["Last_Status"]),
    notes: S(f["Notes"]),
  };
}

/** All connections for an org (admin page). Empty when control is off — or when
 *  the table doesn't exist yet on this control base (before the migration
 *  script runs), so the page degrades gracefully instead of 500-ing. */
export async function listConnections(orgSlug: string): Promise<ConnectionEntry[]> {
  const base = controlBaseId();
  if (!base || !orgSlug) return [];
  try {
    const recs = await listRecords(base, CONNECTIONS, {
      filterByFormula: `{Org_Slug}='${formulaSafe(orgSlug)}'`,
      maxRecords: 1000,
    });
    return recs
      .map(toConnectionEntry)
      .sort((a, b) => a.channel.localeCompare(b.channel) || a.direction.localeCompare(b.direction));
  } catch {
    return [];
  }
}

/** The active connection for a channel+direction, or null. Fail-closed: any
 *  error (incl. a missing table) resolves to null, so the endpoint's
 *  default-deny gate denies rather than crashing. */
export async function getActiveConnection(
  orgSlug: string,
  channel: string,
  direction: ConnectionDirection,
): Promise<ConnectionEntry | null> {
  const base = controlBaseId();
  if (!base) return null;
  try {
    const recs = await listRecords(base, CONNECTIONS, {
      filterByFormula: `{Connection_Key}='${formulaSafe(connectionKey(orgSlug, channel, direction))}'`,
      maxRecords: 1,
    });
    const entry = recs.length ? toConnectionEntry(recs[0]) : null;
    return entry && entry.isActive ? entry : null;
  } catch {
    return null;
  }
}

export async function createConnection(entry: NewConnection): Promise<void> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  await createRecords(base, CONNECTIONS, [
    {
      Connection_Key: connectionKey(entry.orgSlug, entry.channel, entry.direction),
      Org_Slug: entry.orgSlug,
      Channel: entry.channel,
      Direction: entry.direction,
      Is_Active: true,
      Event_Filter: entry.eventFilter ?? "",
      Credential_Ref: entry.credentialRef ?? "",
      Notes: entry.notes ?? "",
    },
  ]);
}

export async function updateConnection(
  recordId: string,
  patch: Partial<{ isActive: boolean; eventFilter: string; credentialRef: string; notes: string }>,
): Promise<void> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  const fields: Record<string, unknown> = {};
  if (patch.isActive !== undefined) fields["Is_Active"] = patch.isActive;
  if (patch.eventFilter !== undefined) fields["Event_Filter"] = patch.eventFilter;
  if (patch.credentialRef !== undefined) fields["Credential_Ref"] = patch.credentialRef;
  if (patch.notes !== undefined) fields["Notes"] = patch.notes;
  if (Object.keys(fields).length === 0) return;
  await updateRecords(base, CONNECTIONS, [{ id: recordId, fields }]);
}

export async function deleteConnection(recordId: string): Promise<void> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  await deleteRecords(base, CONNECTIONS, [recordId]);
}

/** Record delivery health on a connection row. Best-effort — never throws into
 *  a request path (a missing row or control-off is silently ignored). */
export async function touchConnectionHealth(
  orgSlug: string,
  channel: string,
  direction: ConnectionDirection,
  status: string,
): Promise<void> {
  const base = controlBaseId();
  if (!base) return;
  try {
    const recs = await listRecords(base, CONNECTIONS, {
      filterByFormula: `{Connection_Key}='${formulaSafe(connectionKey(orgSlug, channel, direction))}'`,
      maxRecords: 1,
    });
    if (!recs.length) return;
    await updateRecords(base, CONNECTIONS, [
      { id: recs[0].id, fields: { Last_Event_At: new Date().toISOString(), Last_Status: status.slice(0, 200) } },
    ]);
  } catch {
    /* health telemetry is best-effort */
  }
}

/** Does the org have at least one active OUTBOUND connection? Gates whether the
 *  platform bothers to enqueue outbound events. Fail-closed on error → false. */
export async function hasActiveOutbound(orgSlug: string): Promise<boolean> {
  const base = controlBaseId();
  if (!base || !orgSlug) return false;
  try {
    const recs = await listRecords(base, CONNECTIONS, {
      filterByFormula: `AND({Org_Slug}='${formulaSafe(orgSlug)}',{Direction}='out',{Is_Active}=1)`,
      maxRecords: 1,
    });
    return recs.length > 0;
  } catch {
    return false;
  }
}

// ── PLAT_OUTBOX — outbound event queue (n8n delivers; platform only enqueues) ──

export interface OutboxEntry {
  recordId: string;
  event: string;
  orgSlug: string;
  entityType: string;
  entityId: string;
  jobId: string;
  summary: string;
  status: string;
  attempts: number;
  createdAt: string;
  deliveredAt: string;
}

export interface OutboxInput {
  orgSlug: string;
  event: string;
  entityType: string;
  entityId: string;
  jobId?: string;
  summary?: string;
  data?: Record<string, unknown>;
}

function toOutboxEntry(r: { id: string; fields: Record<string, unknown> }): OutboxEntry {
  const f = r.fields;
  return {
    recordId: r.id,
    event: S(f["Event"]),
    orgSlug: S(f["Org_Slug"]),
    entityType: S(f["Entity_Type"]),
    entityId: S(f["Entity_Id"]),
    jobId: S(f["Job_Id"]),
    summary: S(f["Summary"]),
    status: S(f["Status"]) || "pending",
    attempts: N(f["Attempts"]),
    createdAt: S(f["Created_At"]),
    deliveredAt: S(f["Delivered_At"]),
  };
}

/** Enqueue a `pending` outbound event. Callers should gate on hasActiveOutbound
 *  first (see lib/platform/outbox.ts); this just writes the row. */
export async function enqueueOutbox(input: OutboxInput): Promise<void> {
  const base = controlBaseId();
  if (!base) return;
  await createRecords(base, OUTBOX, [
    {
      Event: input.event,
      Org_Slug: input.orgSlug,
      Entity_Type: input.entityType,
      Entity_Id: input.entityId,
      Job_Id: input.jobId ?? "",
      Summary: input.summary ?? "",
      Payload: input.data ? JSON.stringify(input.data) : "{}",
      Status: "pending",
      Created_At: new Date().toISOString(),
      Attempts: 0,
    },
  ]);
}

/** Recent outbound events for an org (admin page). Empty on error / no table. */
export async function listOutbox(orgSlug: string, limit = 25): Promise<OutboxEntry[]> {
  const base = controlBaseId();
  if (!base || !orgSlug) return [];
  try {
    const recs = await listRecords(base, OUTBOX, {
      filterByFormula: `{Org_Slug}='${formulaSafe(orgSlug)}'`,
      maxRecords: 200,
    });
    return recs
      .map(toOutboxEntry)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** All `failed` outbox rows across every org (the scheduler redrive sweep reads
 *  this control-base-wide table). Empty on error / no table. */
export async function listFailedOutbox(limit = 200): Promise<OutboxEntry[]> {
  const base = controlBaseId();
  if (!base) return [];
  try {
    const recs = await listRecords(base, OUTBOX, {
      filterByFormula: `{Status}='failed'`,
      maxRecords: limit,
    });
    return recs.map(toOutboxEntry);
  } catch {
    return [];
  }
}

/** Set an outbox row's Status (redrive → `pending`, DLQ → `dead`). */
export async function setOutboxStatus(recordId: string, status: string): Promise<void> {
  const base = controlBaseId();
  if (!base) return;
  await updateRecords(base, OUTBOX, [{ id: recordId, fields: { Status: status } }]);
}

// ── PLAT_REPORT_CATALOG — saved report templates (reporting Phase 4) ────────
// An org's custom promptSpec promoted to a reusable definition: it appears in
// the Reports dropdown alongside the code catalog and generates via the stored
// prompt + scopes. All reads fail soft (missing table → empty) so the Reports
// page degrades gracefully on a control base that predates the table.

export interface ReportTemplateEntry {
  recordId: string;
  key: string;
  orgSlug: string;
  title: string;
  prompt: string;
  scopes: string[];
  isActive: boolean;
}

function toReportTemplate(r: { id: string; fields: Record<string, unknown> }): ReportTemplateEntry {
  const f = r.fields;
  let scopes: string[] = [];
  try {
    const p = JSON.parse(S(f["Scopes"]) || "[]");
    if (Array.isArray(p)) scopes = p.map(String);
  } catch {
    /* leave empty on malformed JSON */
  }
  return {
    recordId: r.id,
    key: S(f["Key"]),
    orgSlug: S(f["Org_Slug"]),
    title: S(f["Title"]),
    prompt: S(f["Prompt"]),
    scopes,
    isActive: f["Is_Active"] !== false,
  };
}

/** Active saved templates for an org (Reports dropdown). */
export async function listReportTemplates(orgSlug: string): Promise<ReportTemplateEntry[]> {
  const base = controlBaseId();
  if (!base || !orgSlug) return [];
  try {
    const recs = await listRecords(base, REPORT_CATALOG_TBL, {
      filterByFormula: `{Org_Slug}='${formulaSafe(orgSlug)}'`,
      maxRecords: 200,
    });
    return recs
      .map(toReportTemplate)
      .filter((e) => e.key && e.isActive)
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

/** Resolve one template by its stable key, or null. */
export async function getReportTemplate(orgSlug: string, key: string): Promise<ReportTemplateEntry | null> {
  const base = controlBaseId();
  if (!base || !key) return null;
  try {
    const recs = await listRecords(base, REPORT_CATALOG_TBL, {
      filterByFormula: `AND({Org_Slug}='${formulaSafe(orgSlug)}',{Key}='${formulaSafe(key)}')`,
      maxRecords: 1,
    });
    const entry = recs.length ? toReportTemplate(recs[0]) : null;
    return entry && entry.isActive ? entry : null;
  } catch {
    return null;
  }
}

/** Persist a template ("Save as template" on a custom report). */
export async function createReportTemplate(entry: {
  orgSlug: string;
  key: string;
  title: string;
  prompt: string;
  scopes: string[];
}): Promise<void> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  await createRecords(base, REPORT_CATALOG_TBL, [
    {
      Key: entry.key,
      Org_Slug: entry.orgSlug,
      Title: entry.title,
      Prompt: entry.prompt,
      Scopes: JSON.stringify(entry.scopes),
      Source: "saved",
      Is_Active: true,
    },
  ]);
}

/** Active team members for an org (auth). Cached — member changes made outside
 *  the app (Airtable UI) take up to CONTROL_TTL_MS to apply. */
export async function listControlTeam(slug: string): Promise<ControlTeamMember[]> {
  return (await listControlTeamAll(slug)).filter((m) => m.isActive);
}

/** Every team member for an org, including deactivated ones — for the team
 *  management page. Shares the cache with listControlTeam. */
export async function listControlTeamAll(slug: string): Promise<ControlTeamMember[]> {
  const base = controlBaseId();
  if (!base) return [];
  return teamCache.get(slug, () => fetchControlTeam(base, slug));
}

async function fetchControlTeam(base: string, slug: string): Promise<ControlTeamMember[]> {
  const recs = await listRecords(base, TEAM, {
    filterByFormula: `{Org_Slug}='${formulaSafe(slug)}'`,
    maxRecords: 500,
  });
  return recs.map((r) => {
    const f = r.fields;
    return {
      name: S(f["Name"]),
      email: S(f["Email"]),
      role: S(f["Role"]) || "owner",
      isActive: f["Is_Active"] !== false,
    };
  });
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
  invalidateControlCache(entry.slug);
  return orgId;
}

export interface OrgDeletionResult {
  slug: string;
  /** The org's Airtable base id, if it had one — the caller surfaces this so an
   *  operator can delete the base manually (the API can't delete bases). */
  baseId: string | null;
  removedRegistry: number;
  removedTeam: number;
}

/**
 * Remove an org from the control registry: its PLAT_ORG_REGISTRY row plus every
 * PLAT_TEAM row for the slug. This is how a (test or broken) client is offboarded
 * so it stops appearing in the picker. It does NOT delete the org's per-customer
 * Airtable base — Airtable's API has no base-delete — so the base id is returned
 * for the operator to remove manually in the Airtable UI.
 */
export async function deleteOrgFromRegistry(slug: string): Promise<OrgDeletionResult> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  const safe = formulaSafe(slug);
  const regRecs = await listRecords(base, REGISTRY, {
    filterByFormula: `{Slug}='${safe}'`,
    maxRecords: 10,
  });
  const baseId = regRecs.length ? S(regRecs[0].fields["Airtable_Base_Id"]) || null : null;
  const teamRecs = await listRecords(base, TEAM, {
    filterByFormula: `{Org_Slug}='${safe}'`,
    maxRecords: 1000,
  });
  if (regRecs.length) await deleteRecords(base, REGISTRY, regRecs.map((r) => r.id));
  if (teamRecs.length) await deleteRecords(base, TEAM, teamRecs.map((r) => r.id));
  invalidateControlCache(slug);
  return { slug, baseId, removedRegistry: regRecs.length, removedTeam: teamRecs.length };
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
  teamCache.delete(slug);
}

/** Update a team member's role and/or active flag, matched by slug + email
 *  (case-insensitive). Returns false when no matching row exists. */
export async function updateControlTeamMember(
  slug: string,
  email: string,
  patch: { role?: string; isActive?: boolean; name?: string },
): Promise<boolean> {
  const base = controlBaseId();
  if (!base) return false;
  const recs = await listRecords(base, TEAM, {
    filterByFormula: `AND({Org_Slug}='${formulaSafe(slug)}', LOWER({Email})='${formulaSafe(email.toLowerCase())}')`,
    maxRecords: 10,
  });
  if (!recs.length) return false;
  const fields: Record<string, unknown> = {};
  if (patch.role !== undefined) fields["Role"] = patch.role;
  if (patch.isActive !== undefined) fields["Is_Active"] = patch.isActive;
  if (patch.name !== undefined) fields["Name"] = patch.name;
  await updateRecords(base, TEAM, recs.map((r) => ({ id: r.id, fields })));
  teamCache.delete(slug);
  return true;
}

/** Update an org's AI write-authority level (governance §8 management UI). */
export async function setOrgAiAuthority(slug: string, aiAuthority: string): Promise<boolean> {
  const base = controlBaseId();
  if (!base) return false;
  const recs = await listRecords(base, REGISTRY, {
    filterByFormula: `{Slug}='${formulaSafe(slug)}'`,
    maxRecords: 1,
  });
  if (!recs.length) return false;
  await updateRecords(base, REGISTRY, [{ id: recs[0].id, fields: { Ai_Authority: aiAuthority } }]);
  invalidateControlCache(slug);
  return true;
}

// ── Template registry ───────────────────────────────────────────────────────
// Industry → Sub-industry → template-base mapping, in the control base so new
// industries can be onboarded by adding a row (via the admin page) instead of a
// code change. Vertical_Key is the industry-level routing key (DOMAIN_LABELS +
// assessment module); Template_Base_Id is the base a new customer clones from.

export interface TemplateRegistryEntry {
  recordId: string;
  industry: string;
  subIndustry: string;
  verticalKey: string;
  templateBaseId: string;
  sortOrder: number;
  isActive: boolean;
}

function toTemplateEntry(r: { id: string; fields: Record<string, unknown> }): TemplateRegistryEntry {
  const f = r.fields;
  return {
    recordId: r.id,
    industry: S(f["Industry"]),
    subIndustry: S(f["Sub_Industry"]),
    verticalKey: S(f["Vertical_Key"]),
    templateBaseId: S(f["Template_Base_Id"]),
    sortOrder: N(f["Sort_Order"]),
    isActive: f["Is_Active"] !== false,
  };
}

/** Active industry→template mappings, sorted for the dropdown + admin list.
 *  Empty when control is off (callers fall back to the hardcoded map). */
export async function listTemplateRegistry(opts: { includeInactive?: boolean } = {}): Promise<TemplateRegistryEntry[]> {
  const base = controlBaseId();
  if (!base) return [];
  const recs = await listRecords(base, TEMPLATE_REGISTRY, { maxRecords: 1000 });
  return recs
    .map(toTemplateEntry)
    .filter((e) => e.templateBaseId && (opts.includeInactive || e.isActive))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.industry.localeCompare(b.industry));
}

/** Resolve one mapping by its Airtable record id (used by the onboarding action
 *  to turn the selected dropdown option into a template + vertical key). */
export async function getTemplateRegistryEntry(recordId: string): Promise<TemplateRegistryEntry | null> {
  const base = controlBaseId();
  if (!base || !recordId) return null;
  try {
    const rec = await getRecord(base, TEMPLATE_REGISTRY, recordId);
    return toTemplateEntry(rec);
  } catch {
    return null;
  }
}

export interface NewTemplateRegistry {
  industry: string;
  subIndustry: string;
  verticalKey: string;
  templateBaseId: string;
  sortOrder?: number;
  notes?: string;
}

/** Add a mapping (admin page). */
export async function createTemplateRegistry(entry: NewTemplateRegistry): Promise<void> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  await createRecords(base, TEMPLATE_REGISTRY, [
    {
      Industry: entry.industry,
      Sub_Industry: entry.subIndustry,
      Vertical_Key: entry.verticalKey,
      Template_Base_Id: entry.templateBaseId,
      Sort_Order: entry.sortOrder ?? 0,
      Notes: entry.notes ?? "",
      Is_Active: true,
    },
  ]);
}

/** Patch a mapping's mutable fields (admin page: repoint template, toggle active). */
export async function updateTemplateRegistry(
  recordId: string,
  patch: Partial<{ templateBaseId: string; verticalKey: string; sortOrder: number; isActive: boolean; notes: string }>,
): Promise<void> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  const fields: Record<string, unknown> = {};
  if (patch.templateBaseId !== undefined) fields["Template_Base_Id"] = patch.templateBaseId;
  if (patch.verticalKey !== undefined) fields["Vertical_Key"] = patch.verticalKey;
  if (patch.sortOrder !== undefined) fields["Sort_Order"] = patch.sortOrder;
  if (patch.isActive !== undefined) fields["Is_Active"] = patch.isActive;
  if (patch.notes !== undefined) fields["Notes"] = patch.notes;
  if (Object.keys(fields).length === 0) return;
  await updateRecords(base, TEMPLATE_REGISTRY, [{ id: recordId, fields }]);
}

/** Remove a mapping (admin page). */
export async function deleteTemplateRegistry(recordId: string): Promise<void> {
  const base = controlBaseId();
  if (!base) throw new Error("AIRTABLE_CONTROL_BASE_ID is not set");
  await deleteRecords(base, TEMPLATE_REGISTRY, [recordId]);
}

// ── Job-category catalog ────────────────────────────────────────────────────
// The Assessment Engine's job categories (label + industry-standard phase
// sequence), keyed by Vertical_Key so each vertical has its own set — the same
// key the template registry maps industries onto. Construction/roofing are
// seeded from curated data; a brand-new industry gets an AI-drafted catalog at
// onboarding. Replaces the old hardcoded per-vertical catalog in code.

export interface JobCatalogEntry {
  recordId: string;
  verticalKey: string;
  key: string;
  label: string;
  group: string;
  engagementType: string;
  scopeHint: string;
  phases: string[];
  sortOrder: number;
  /** "curated" (seeded) or "ai" (drafted at onboarding). */
  source: string;
  isActive: boolean;
}

export interface NewJobCatalogEntry {
  verticalKey: string;
  key: string;
  label: string;
  group: string;
  engagementType: string;
  scopeHint: string;
  phases: string[];
  sortOrder?: number;
  source?: string;
}

function toCatalogEntry(r: { id: string; fields: Record<string, unknown> }): JobCatalogEntry {
  const f = r.fields;
  let phases: string[] = [];
  try {
    const p = JSON.parse(S(f["Phases"]) || "[]");
    if (Array.isArray(p)) phases = p.map(String);
  } catch {
    /* leave empty on malformed JSON */
  }
  return {
    recordId: r.id,
    verticalKey: S(f["Vertical_Key"]),
    key: S(f["Key"]),
    label: S(f["Label"]),
    group: S(f["Category_Group"]),
    engagementType: S(f["Engagement_Type"]) || "short_job",
    scopeHint: S(f["Scope_Hint"]),
    phases,
    sortOrder: N(f["Sort_Order"]),
    source: S(f["Source"]) || "curated",
    isActive: f["Is_Active"] !== false,
  };
}

/** Active job categories for a vertical, sorted for display. */
export async function listJobCatalog(
  verticalKey: string,
  opts: { includeInactive?: boolean } = {},
): Promise<JobCatalogEntry[]> {
  const base = controlBaseId();
  if (!base || !verticalKey) return [];
  const recs = await listRecords(base, JOB_CATALOG, {
    filterByFormula: `{Vertical_Key}='${formulaSafe(verticalKey)}'`,
    maxRecords: 1000,
  });
  return recs
    .map(toCatalogEntry)
    .filter((e) => e.key && (opts.includeInactive || e.isActive))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/** Whether a vertical already has a catalog (guards AI generation at onboarding). */
export async function hasJobCatalog(verticalKey: string): Promise<boolean> {
  const base = controlBaseId();
  if (!base || !verticalKey) return false;
  const recs = await listRecords(base, JOB_CATALOG, {
    filterByFormula: `{Vertical_Key}='${formulaSafe(verticalKey)}'`,
    maxRecords: 1,
  });
  return recs.length > 0;
}

/** Insert catalog rows (batched by the client). No-op when unconfigured/empty. */
export async function createJobCatalog(entries: NewJobCatalogEntry[]): Promise<void> {
  const base = controlBaseId();
  if (!base || entries.length === 0) return;
  await createRecords(
    base,
    JOB_CATALOG,
    entries.map((e) => ({
      Key: e.key,
      Vertical_Key: e.verticalKey,
      Label: e.label,
      Category_Group: e.group,
      Engagement_Type: e.engagementType,
      Scope_Hint: e.scopeHint,
      Phases: JSON.stringify(e.phases),
      Sort_Order: e.sortOrder ?? 0,
      Source: e.source ?? "ai",
      Is_Active: true,
    })),
  );
}
