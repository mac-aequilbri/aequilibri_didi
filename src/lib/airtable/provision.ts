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
import { logger } from "@/lib/logger";

const META = "https://api.airtable.com/v0/meta";
const sleep = (ms = 250) => new Promise((r) => setTimeout(r, ms));

/** Tables that make up a platform (UC2/UC3) base — the ones the app's fieldMaps
 *  read/write. TEAM and PRICING exist in the template (Core links to them) but
 *  team/identity is kept Postgres-side, so they are intentionally not copied. */
const PLATFORM_TABLES = new Set([
  "ORGANISATIONS", "CONTACTS", "WORKSTREAMS", "DECISIONS", "ACTION_HUB",
  "EXECUTION_LOG", "CORRECTIONS", "JOBS", "HYPOTHESES", "LEARNING_RULES",
  "DOCUMENTS", "INTELLIGENCE_SNAPSHOT",
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
  for (const p of plan) {
    const tableId = idByName.get(p.name);
    if (!tableId) continue;
    for (const f of p.links) {
      if (handled.has(f.id)) continue;
      const targetName = all.find((t) => t.id === f.options?.linkedTableId)?.name ?? null;
      const linkedTableId = targetName ? idByName.get(targetName) : null;
      if (!linkedTableId) continue; // target not copied (e.g. TEAM/PRICING)
      await sleep();
      await metaFetch(`bases/${newBaseId}/tables/${tableId}/fields`, {
        method: "POST",
        body: JSON.stringify({ name: f.name, type: "multipleRecordLinks", options: { linkedTableId } }),
      });
      handled.add(f.id);
      if (f.options?.inverseLinkFieldId) handled.add(f.options.inverseLinkFieldId);
    }
  }

  return newBaseId;
}
