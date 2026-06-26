// Per-customer base provisioning (server-side, importable).
//
// Onboarding calls provisionClientBase() to clone the STRUCTURE of a template
// base (default: the base AIRTABLE_TEMPLATE_BASE_ID, falling back to the demo
// base) into a fresh base for a new customer, then stores the new baseId on the
// org. Airtable has no clone-base API, so we read the template's full schema
// (with field options) and rebuild it in two passes: tables + simple fields,
// then multipleRecordLinks (deduped via inverseLinkFieldId). Computed fields
// can't be created via the API and are skipped; TEAM/PRICING links are skipped
// by design (team/identity stays Postgres-side).
//
// This is the importable twin of scripts/airtable-provision-base.mjs (an ops
// tool for ad-hoc/dry-run provisioning). Keep the two in sync.

import { airtablePat, DEMO_BASE_ID } from "./config";
import { createRecords, deleteRecords, listRecords } from "./client";
import { logger } from "@/lib/logger";

const META = "https://api.airtable.com/v0/meta";
const sleep = (ms = 250) => new Promise((r) => setTimeout(r, ms));

/** Tables that make up a platform (UC2/UC3) base — the ones the app's fieldMaps
 *  read/write. TEAM and PRICING exist in the template (Core links to them) but
 *  team/identity is kept Postgres-side, so they are intentionally not copied. */
export const PLATFORM_TABLES = new Set([
  "ORGANISATIONS", "CONTACTS", "WORKSTREAMS", "DECISIONS", "ACTION_HUB",
  "EXECUTION_LOG", "CORRECTIONS", "JOBS", "HYPOTHESES", "LEARNING_RULES",
  "DOCUMENTS", "INTELLIGENCE_SNAPSHOT", "ASSESSMENTS", "COMMS",
  "PENDING_WRITES", "CHAT_SESSIONS", "CHAT_MESSAGES",
  "RISKS", "VENDORS", "BUDGET", "CASHFLOW", "PROCUREMENT", "PHASES",
  "VARIATIONS", "QUOTES", "QUOTE_LINES", "ROOM_MATRIX", "MEETING_MINUTES",
  "WEEKLY_REPORTS", "PHASE_EVIDENCE", "BIM_MODELS",
  "PLAT_CFG_REFERENCE", "PLAT_CFG_REGION", "PLAT_CFG_NOMENCLATURE", "PLAT_CFG_SETTING",
]);

// Computed fields cannot be created through the API (no inbound config).
const COMPUTED = new Set([
  "formula", "rollup", "count", "multipleLookupValues", "lookup",
  "createdTime", "lastModifiedTime", "createdBy", "lastModifiedBy",
  "autoNumber", "button", "externalSyncSource", "aiText",
]);

interface AirField {
  id: string;
  name: string;
  type: string;
  options?: Record<string, unknown> & { linkedTableId?: string; inverseLinkFieldId?: string };
}
interface AirTable { id: string; name: string; fields: AirField[] }
interface FieldSpec { name: string; type: string; options?: Record<string, unknown> }

const isLink = (f: AirField) => f.type === "multipleRecordLinks";
const isComputed = (f: AirField) => COMPUTED.has(f.type);
const isSimple = (f: AirField) => !isLink(f) && !isComputed(f);

/** Strip option keys the create-field API rejects; keep shaping options. */
function cleanOptions(f: AirField): Record<string, unknown> | undefined {
  const o = f.options;
  if (!o) return undefined;
  if (f.type === "singleSelect" || f.type === "multipleSelects") {
    const choices = (o.choices as Array<{ name: string; color?: string }> | undefined) ?? [];
    return { choices: choices.map((c) => ({ name: c.name, ...(c.color ? { color: c.color } : {}) })) };
  }
  if (f.type === "currency") return { precision: o.precision ?? 2, symbol: o.symbol ?? "$" };
  if (f.type === "number" || f.type === "percent" || f.type === "duration")
    return { precision: o.precision ?? 0, ...(o.durationFormat ? { durationFormat: o.durationFormat } : {}) };
  if (f.type === "date") return { dateFormat: o.dateFormat ?? { name: "iso" } };
  if (f.type === "dateTime")
    return { dateFormat: o.dateFormat ?? { name: "iso" }, timeZone: o.timeZone ?? "utc", timeFormat: o.timeFormat ?? { name: "24hour" } };
  if (f.type === "checkbox") return { icon: o.icon ?? "check", color: o.color ?? "greenBright" };
  if (f.type === "rating") return { icon: o.icon ?? "star", color: o.color ?? "yellowBright", max: o.max ?? 5 };
  return undefined;
}
const simpleSpec = (f: AirField): FieldSpec => {
  const options = cleanOptions(f);
  return { name: f.name, type: f.type, ...(options ? { options } : {}) };
};

async function metaFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${META}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${airtablePat()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Airtable meta ${path}: HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

/** The base whose structure new client bases are cloned from. */
export function templateBaseId(): string {
  return process.env.AIRTABLE_TEMPLATE_BASE_ID || DEMO_BASE_ID;
}

export type { AirField, AirTable };

/** Read a base's full table+field schema via the meta API. */
export async function readBaseSchema(baseId: string): Promise<AirTable[]> {
  return ((await metaFetch(`bases/${baseId}/tables`)) as { tables: AirTable[] }).tables;
}

/**
 * The schema a freshly provisioned base is *expected* to have, derived from the
 * template using the SAME copy rules as provisionClientBase: platform tables
 * only, and only fields the provisioner can actually create (no computed fields,
 * and no link fields whose target table isn't itself copied — e.g. TEAM/PRICING).
 * Schema drift is measured against this, so a correctly-cloned base shows zero
 * drift rather than false positives for fields that are never cloned.
 *
 * Returns a map of table name → set of expected field names.
 */
export function expectedPlatformSchema(templateTables: AirTable[]): Map<string, Set<string>> {
  const copiedTableNames = new Set(
    templateTables.filter((t) => PLATFORM_TABLES.has(t.name)).map((t) => t.name),
  );
  const out = new Map<string, Set<string>>();
  for (const t of templateTables) {
    if (!PLATFORM_TABLES.has(t.name)) continue;
    const fields = new Set<string>();
    for (const f of t.fields) {
      if (isComputed(f)) continue;
      if (isLink(f)) {
        const target = templateTables.find((x) => x.id === f.options?.linkedTableId)?.name;
        if (!target || !copiedTableNames.has(target)) continue;
      }
      fields.add(f.name);
    }
    out.set(t.name, fields);
  }
  return out;
}

/**
 * Provision a new client base by replicating the template's structure. Returns
 * the new base id. Throws on any hard failure (caller must treat onboarding as
 * failed — a customer without its base is unusable in Airtable mode).
 */
export async function provisionClientBase(
  name: string,
  opts: { templateBaseId?: string; workspaceId?: string } = {},
): Promise<string> {
  const from = opts.templateBaseId ?? templateBaseId();
  const workspaceId = opts.workspaceId ?? process.env.AIRTABLE_WORKSPACE_ID ?? "";
  if (!workspaceId) throw new Error("AIRTABLE_WORKSPACE_ID is not set — cannot create a base.");

  const all = ((await metaFetch(`bases/${from}/tables`)) as { tables: AirTable[] }).tables;
  const tables = all.filter((t) => PLATFORM_TABLES.has(t.name));
  const plan = tables.map((t) => {
    const simple = t.fields.filter(isSimple);
    return { name: t.name, primary: simple[0] ?? null, rest: simple.slice(1), links: t.fields.filter(isLink) };
  });

  const [first, ...others] = plan;
  if (!first?.primary) throw new Error(`template ${from}: first table has no creatable primary field`);

  // pass 0 — create the base with the first table (createBase requires >=1).
  const created = (await metaFetch("bases", {
    method: "POST",
    body: JSON.stringify({
      name,
      workspaceId,
      tables: [{ name: first.name, fields: [simpleSpec(first.primary), ...first.rest.map(simpleSpec)] }],
    }),
  })) as { id: string; tables: Array<{ id: string; name: string }> };
  const newBaseId = created.id;
  const idByName = new Map(created.tables.map((t) => [t.name, t.id]));
  logger.info("Provisioned Airtable base", { baseId: newBaseId, name, from });

  // pass 1 — remaining tables with their simple fields.
  for (const p of others) {
    if (!p.primary) { logger.warn("Skip table (no primary)", { table: p.name }); continue; }
    await sleep();
    const t = (await metaFetch(`bases/${newBaseId}/tables`, {
      method: "POST",
      body: JSON.stringify({ name: p.name, fields: [simpleSpec(p.primary), ...p.rest.map(simpleSpec)] }),
    })) as { id: string };
    idByName.set(p.name, t.id);
  }

  // pass 2 — link fields; create one side per symmetric pair, skip targets we
  // didn't copy (TEAM/PRICING).
  const handled = new Set<string>();
  // Resolve a template field's name by its id (to rename auto-created reverses).
  const templateFieldName = (fieldId: string): string | undefined => {
    for (const t of all) {
      const f = t.fields.find((x) => x.id === fieldId);
      if (f) return f.name;
    }
    return undefined;
  };
  for (const p of plan) {
    const tableId = idByName.get(p.name);
    if (!tableId) continue;
    for (const f of p.links) {
      if (handled.has(f.id)) continue;
      const targetName = all.find((t) => t.id === f.options?.linkedTableId)?.name ?? null;
      const linkedTableId = targetName ? idByName.get(targetName) : null;
      if (!linkedTableId) continue; // target not copied (e.g. TEAM/PRICING)
      await sleep();
      const created = (await metaFetch(`bases/${newBaseId}/tables/${tableId}/fields`, {
        method: "POST",
        body: JSON.stringify({ name: f.name, type: "multipleRecordLinks", options: { linkedTableId } }),
      })) as { options?: { inverseLinkFieldId?: string } };
      handled.add(f.id);
      // Airtable auto-creates the reverse field on the target table with a
      // default name (the source table's name), NOT the template's. Rename it
      // to the template's inverse field name so the app can address both sides.
      const tmplInvId = f.options?.inverseLinkFieldId;
      if (tmplInvId) {
        handled.add(tmplInvId);
        const wantName = templateFieldName(tmplInvId);
        const newInvId = created.options?.inverseLinkFieldId;
        if (wantName && newInvId) {
          await sleep();
          await metaFetch(`bases/${newBaseId}/tables/${linkedTableId}/fields/${newInvId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: wantName }),
          });
        }
      }
    }
  }

  return newBaseId;
}

/**
 * Verify the API token can actually READ and WRITE records on a base via the
 * data API — not just provision its schema (meta API). A base can clone fine
 * (meta scope) yet 403 on records if the token lacks data scope/access, which
 * otherwise surfaces as an opaque error on the first page load. Probes a table
 * that always exists in a platform clone, with a short retry for any transient
 * post-creation delay. Throws (with base+resource context via AirtableError) if
 * the base is not usable.
 */
export async function probeBaseDataAccess(
  baseId: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 1500;
  const PROBE_TABLE = "PLAT_CFG_SETTING";
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await listRecords(baseId, PROBE_TABLE, { maxRecords: 1 });
      const [rec] = await createRecords(baseId, PROBE_TABLE, [
        { Setting_Key: "__provision_probe__" },
      ]);
      if (rec?.id) await deleteRecords(baseId, PROBE_TABLE, [rec.id]);
      return;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface MigrationResult {
  baseId: string;
  templateBaseId: string;
  createdTables: string[];
  addedFields: { table: string; field: string }[];
  createdLinks: { table: string; field: string }[];
  skipped: { item: string; reason: string }[];
  errors: string[];
  changed: boolean;
}

const errMsg = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, 160);

/**
 * Bring an existing client base UP to the template's provisionable schema —
 * the "migrate this base" action behind the schema-drift dashboard. Additive
 * only: it creates missing tables, missing simple fields, and missing link
 * fields (deduping symmetric pairs and renaming the auto-created reverse, same
 * as provisionClientBase). It NEVER deletes or alters existing fields, so it is
 * safe to re-run and cannot lose data. Computed fields and TEAM/PRICING links
 * are skipped exactly as in provisioning, so a base reads in-sync afterwards.
 */
export async function migrateBaseToTemplate(
  baseId: string,
  opts: { templateBaseId?: string } = {},
): Promise<MigrationResult> {
  const from = opts.templateBaseId ?? templateBaseId();
  const res: MigrationResult = {
    baseId,
    templateBaseId: from,
    createdTables: [],
    addedFields: [],
    createdLinks: [],
    skipped: [],
    errors: [],
    changed: false,
  };

  const all = await readBaseSchema(from);
  const platformTemplate = all.filter((t) => PLATFORM_TABLES.has(t.name));
  const copiedNames = new Set(platformTemplate.map((t) => t.name));

  const target = await readBaseSchema(baseId);
  const targetByName = new Set(target.map((t) => t.name));
  const idByName = new Map(target.map((t) => [t.name, t.id]));
  const targetFields = new Map(target.map((t) => [t.name, new Set(t.fields.map((f) => f.name))]));

  const templateFieldName = (fieldId: string): string | undefined => {
    for (const t of all) {
      const f = t.fields.find((x) => x.id === fieldId);
      if (f) return f.name;
    }
    return undefined;
  };

  // Phase A — create missing tables with their simple fields.
  for (const t of platformTemplate) {
    if (targetByName.has(t.name)) continue;
    const simple = t.fields.filter(isSimple);
    const primary = simple[0];
    if (!primary) {
      res.skipped.push({ item: `table ${t.name}`, reason: "no creatable primary field" });
      continue;
    }
    try {
      await sleep();
      const created = (await metaFetch(`bases/${baseId}/tables`, {
        method: "POST",
        body: JSON.stringify({
          name: t.name,
          fields: [simpleSpec(primary), ...simple.slice(1).map(simpleSpec)],
        }),
      })) as { id: string };
      idByName.set(t.name, created.id);
      targetFields.set(t.name, new Set(simple.map((f) => f.name)));
      res.createdTables.push(t.name);
      res.changed = true;
    } catch (e) {
      res.errors.push(`create table ${t.name}: ${errMsg(e)}`);
    }
  }

  // Phase B — add missing simple fields to tables that already existed.
  for (const t of platformTemplate) {
    if (res.createdTables.includes(t.name)) continue; // created above with all simple fields
    const tableId = idByName.get(t.name);
    const have = targetFields.get(t.name);
    if (!tableId || !have) continue;
    for (const f of t.fields) {
      if (!isSimple(f) || have.has(f.name)) continue;
      try {
        await sleep();
        await metaFetch(`bases/${baseId}/tables/${tableId}/fields`, {
          method: "POST",
          body: JSON.stringify(simpleSpec(f)),
        });
        have.add(f.name);
        res.addedFields.push({ table: t.name, field: f.name });
        res.changed = true;
      } catch (e) {
        res.errors.push(`add ${t.name}.${f.name}: ${errMsg(e)}`);
      }
    }
  }

  // Phase C — link fields: one side per symmetric pair, skip when the
  // relationship is already present, skip targets we don't copy (TEAM/PRICING).
  const handled = new Set<string>();
  for (const t of platformTemplate) {
    const tableId = idByName.get(t.name);
    if (!tableId) continue;
    for (const f of t.fields.filter(isLink)) {
      if (handled.has(f.id)) continue;
      const invId = f.options?.inverseLinkFieldId;
      handled.add(f.id);
      if (invId) handled.add(invId);

      const targetTableName = all.find((x) => x.id === f.options?.linkedTableId)?.name ?? null;
      if (!targetTableName || !copiedNames.has(targetTableName)) continue; // not copied
      const linkedTableId = idByName.get(targetTableName);
      if (!linkedTableId) {
        res.errors.push(`link ${t.name}.${f.name}: target ${targetTableName} absent`);
        continue;
      }

      const invName = invId ? templateFieldName(invId) : undefined;
      const haveSrc = targetFields.get(t.name)?.has(f.name) ?? false;
      const haveInv = invName ? (targetFields.get(targetTableName)?.has(invName) ?? false) : false;
      if (haveSrc || haveInv) continue; // relationship already exists on a side

      try {
        await sleep();
        const created = (await metaFetch(`bases/${baseId}/tables/${tableId}/fields`, {
          method: "POST",
          body: JSON.stringify({ name: f.name, type: "multipleRecordLinks", options: { linkedTableId } }),
        })) as { options?: { inverseLinkFieldId?: string } };
        targetFields.get(t.name)?.add(f.name);
        res.createdLinks.push({ table: t.name, field: f.name });
        res.changed = true;
        // Rename the auto-created reverse to the template's inverse name.
        const newInvId = created.options?.inverseLinkFieldId;
        if (invName && newInvId) {
          await sleep();
          await metaFetch(`bases/${baseId}/tables/${linkedTableId}/fields/${newInvId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: invName }),
          });
          targetFields.get(targetTableName)?.add(invName);
        }
      } catch (e) {
        res.errors.push(`create link ${t.name}.${f.name}: ${errMsg(e)}`);
      }
    }
  }

  return res;
}
