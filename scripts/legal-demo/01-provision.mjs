// Stage 1 — provision the law firm's Airtable base.
//
// Legal has no vertical template yet, so we clone the STRUCTURE of the
// Construction template (full 21-table Core + generic domain tables) into a
// fresh base, exactly as the app's provisionClientBase does (two-pass: simple
// fields, then links; computed fields skipped). Then add the app-runtime tables
// (approval queue, chat, assessment intake, customer-config) that no template
// carries. The new base id is written to state.json for the later stages.
//
//   node scripts/legal-demo/01-provision.mjs
//
// Idempotent: re-running with a base id already in state.json is a no-op unless
// --force is passed (which provisions a brand-new base).

import {
  env, readBaseSchema, metaPost, metaPatch, listAll, createAll, sleep,
  loadState, mergeState, log,
} from "./_lib.mjs";
import { FIRM } from "./data.mjs";

const CONSTRUCTION_TEMPLATE = "appXfwBLE6zBEL5Zr";
// The PAT can create bases in this workspace (verified empirically). The
// AIRTABLE_WORKSPACE_ID in .env (wsppysXBoesIgMtpA) is the pre-transfer
// workspace and 403s on base creation, so override it here; a LEGAL_DEMO_WORKSPACE_ID
// env var wins if set.
const WORKSPACE_ID = env("LEGAL_DEMO_WORKSPACE_ID") || "wsp0SwxU3j8IwLZJ1";
const force = process.argv.includes("--force");

const PLATFORM_TABLES = new Set([
  "ORGANISATIONS", "CONTACTS", "WORKSTREAMS", "DECISIONS", "ISSUES",
  "EXECUTION_LOG", "CORRECTIONS", "JOBS", "HYPOTHESES", "LEARNING_RULES",
  "DOCUMENTS", "INTELLIGENCE_SNAPSHOT", "COMMS", "RISKS", "BUDGET",
  "CASHFLOWS", "PROCUREMENT", "PHASES", "PLAN", "CHANGE_LOG",
  "REGIONS", "DOMAIN_LABELS", "ENGAGEMENT_TYPE_CONFIG",
  "REF_ZONES", "REF_BUDGET", "ROOM_MATRIX", "QUANTITY_TAKEOFF", "TRADE_PACKAGES",
  "CONTRACTOR_BIDS", "BID_LINE_ITEMS",
  "VENDORS", "VARIATIONS", "QUOTE_LINES", "MEETING_MINUTES",
  "WEEKLY_REPORTS", "PHASE_EVIDENCE", "BIM_MODELS",
]);

const COMPUTED = new Set([
  "formula", "rollup", "count", "multipleLookupValues", "lookup",
  "createdTime", "lastModifiedTime", "createdBy", "lastModifiedBy",
  "autoNumber", "button", "externalSyncSource", "aiText",
]);
const isLink = (f) => f.type === "multipleRecordLinks";
const isComputed = (f) => COMPUTED.has(f.type);
const isSimple = (f) => !isLink(f) && !isComputed(f);

function cleanOptions(f) {
  const o = f.options;
  if (!o) return undefined;
  if (f.type === "singleSelect" || f.type === "multipleSelects")
    return { choices: (o.choices ?? []).map((c) => ({ name: c.name, ...(c.color ? { color: c.color } : {}) })) };
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
const simpleSpec = (f) => {
  const options = cleanOptions(f);
  return { name: f.name, type: f.type, ...(options ? { options } : {}) };
};

const DT = { dateFormat: { name: "iso" }, timeZone: "utc", timeFormat: { name: "24hour" } };
const APP_RUNTIME_TABLES = [
  { name: "PENDING_WRITES", fields: [
    { name: "Table_Key", type: "singleLineText" },
    { name: "Op", type: "singleSelect", options: { choices: [{ name: "create" }, { name: "update" }, { name: "delete" }] } },
    { name: "Record_Id", type: "singleLineText" }, { name: "Payload", type: "multilineText" },
    { name: "Actor_Type", type: "singleLineText" }, { name: "Actor_Name", type: "singleLineText" },
    { name: "Status", type: "singleSelect", options: { choices: [{ name: "proposed" }, { name: "executed" }, { name: "rejected" }, { name: "expired" }, { name: "failed" }] } },
    { name: "Created_At", type: "dateTime", options: DT }, { name: "Expires_At", type: "dateTime", options: DT },
    { name: "Job_Id", type: "singleLineText" }, { name: "Resolved_By", type: "singleLineText" },
    { name: "Resolved_At", type: "dateTime", options: DT }, { name: "Error", type: "multilineText" },
  ] },
  { name: "CHAT_SESSIONS", fields: [
    { name: "Session_Title", type: "singleLineText" }, { name: "Job_Id", type: "singleLineText" },
    { name: "Started_At", type: "dateTime", options: DT }, { name: "Ended_At", type: "dateTime", options: DT },
    { name: "Summary", type: "multilineText" },
  ] },
  { name: "CHAT_MESSAGES", fields: [
    { name: "Session_Id", type: "singleLineText" }, { name: "Role", type: "singleLineText" },
    { name: "Content", type: "multilineText" }, { name: "Tool_Calls", type: "multilineText" },
    { name: "Created_At", type: "dateTime", options: DT },
  ] },
  { name: "ASSESSMENTS", fields: [
    { name: "Assessment_Name", type: "singleLineText" }, { name: "Engagement_Type", type: "singleLineText" },
    { name: "Address", type: "singleLineText" }, { name: "Suburb", type: "singleLineText" },
    { name: "Size_Sqm", type: "number", options: { precision: 0 } }, { name: "Scope", type: "multilineText" },
    { name: "Result", type: "multilineText" },
    { name: "Status", type: "singleSelect", options: { choices: [{ name: "draft" }, { name: "accepted" }, { name: "discarded" }] } },
    { name: "Prompt_Version", type: "singleLineText" }, { name: "Created_By", type: "singleLineText" },
  ] },
  { name: "PLAT_CFG_REFERENCE", fields: [
    { name: "Name", type: "singleLineText" }, { name: "Ref_Type", type: "singleLineText" },
    { name: "Code", type: "singleLineText" }, { name: "Value", type: "multilineText" },
    { name: "Sort_Order", type: "number", options: { precision: 0 } },
    { name: "Is_Active", type: "checkbox", options: { icon: "check", color: "greenBright" } },
  ] },
  { name: "PLAT_CFG_SETTING", fields: [
    { name: "Setting_Key", type: "singleLineText" }, { name: "Value", type: "multilineText" },
  ] },
];

async function provisionBase(name, templateBaseId) {
  const all = await readBaseSchema(templateBaseId);
  const tables = all.filter((t) => PLATFORM_TABLES.has(t.name));
  const plan = tables.map((t) => {
    const simple = t.fields.filter(isSimple);
    return { name: t.name, primary: simple[0] ?? null, rest: simple.slice(1), links: t.fields.filter(isLink) };
  });
  const [first, ...others] = plan;
  if (!first?.primary) throw new Error("template first table has no creatable primary field");

  const created = await metaPost("bases", {
    name, workspaceId: WORKSPACE_ID,
    tables: [{ name: first.name, fields: [simpleSpec(first.primary), ...first.rest.map(simpleSpec)] }],
  });
  const newBaseId = created.id;
  const idByName = new Map(created.tables.map((t) => [t.name, t.id]));
  log(`  created base ${newBaseId} (${name})`);

  for (const p of others) {
    if (!p.primary) { log(`  ! skip ${p.name} (no primary)`); continue; }
    await sleep(120);
    const t = await metaPost(`bases/${newBaseId}/tables`, { name: p.name, fields: [simpleSpec(p.primary), ...p.rest.map(simpleSpec)] });
    idByName.set(p.name, t.id);
    log(`  + table ${p.name}`);
  }

  const handled = new Set();
  const templateFieldName = (id) => { for (const t of all) { const f = t.fields.find((x) => x.id === id); if (f) return f.name; } return undefined; };
  for (const p of plan) {
    const tableId = idByName.get(p.name);
    if (!tableId) continue;
    for (const f of p.links) {
      if (handled.has(f.id)) continue;
      const targetName = all.find((t) => t.id === f.options?.linkedTableId)?.name ?? null;
      const linkedTableId = targetName ? idByName.get(targetName) : null;
      if (!linkedTableId) continue;
      await sleep(120);
      const c = await metaPost(`bases/${newBaseId}/tables/${tableId}/fields`, { name: f.name, type: "multipleRecordLinks", options: { linkedTableId } });
      handled.add(f.id);
      const invId = f.options?.inverseLinkFieldId;
      if (invId) {
        handled.add(invId);
        const wantName = templateFieldName(invId);
        const newInvId = c.options?.inverseLinkFieldId;
        if (wantName && newInvId) { await sleep(120); await metaPatch(`bases/${newBaseId}/tables/${linkedTableId}/fields/${newInvId}`, { name: wantName }); }
      }
    }
  }
  return newBaseId;
}

async function ensureRuntimeTables(baseId) {
  const existing = await readBaseSchema(baseId);
  const byName = new Map(existing.map((t) => [t.name, t]));
  for (const def of APP_RUNTIME_TABLES) {
    if (byName.has(def.name)) { log(`  = ${def.name} exists`); continue; }
    await sleep(120);
    const c = await metaPost(`bases/${baseId}/tables`, { name: def.name, fields: def.fields });
    byName.set(def.name, { id: c.id, name: def.name, fields: [] });
    log(`  + runtime ${def.name}`);
  }
  // ASSESSMENTS.Job → JOBS link (reverse renamed to "ASSESSMENTS").
  const assessments = byName.get("ASSESSMENTS");
  const jobs = byName.get("JOBS");
  const fresh = existing.find((t) => t.name === "ASSESSMENTS");
  const hasJobLink = fresh?.fields.some((f) => f.name === "Job") ?? false;
  if (assessments && jobs && !hasJobLink) {
    await sleep(120);
    const c = await metaPost(`bases/${baseId}/tables/${assessments.id}/fields`, { name: "Job", type: "multipleRecordLinks", options: { linkedTableId: jobs.id } });
    const rev = c.options?.inverseLinkFieldId;
    if (rev) { await sleep(120); await metaPatch(`bases/${baseId}/tables/${jobs.id}/fields/${rev}`, { name: "ASSESSMENTS" }); }
    log("  + ASSESSMENTS.Job link");
  }
}

async function probe(baseId) {
  await listAll(baseId, "PLAT_CFG_SETTING");
  const [rec] = await createAll(baseId, "PLAT_CFG_SETTING", [{ Setting_Key: "__provision_probe__", Value: "ok" }]);
  log(`  ✓ data read/write verified (probe ${rec?.id})`);
}

async function main() {
  const state = loadState();
  if (state.baseId && !force) {
    log(`Base already provisioned: ${state.baseId} (use --force to make a new one). Ensuring runtime tables…`);
    await ensureRuntimeTables(state.baseId);
    await probe(state.baseId);
    return;
  }
  log(`Provisioning base for "${FIRM.name}" from Construction template ${CONSTRUCTION_TEMPLATE}…`);
  const baseId = await provisionBase(FIRM.name, CONSTRUCTION_TEMPLATE);
  await sleep(500);
  await ensureRuntimeTables(baseId);
  await probe(baseId);
  mergeState({ baseId, firm: FIRM.slug, provisionedFrom: CONSTRUCTION_TEMPLATE });
  log(`\nDONE. New base: ${baseId}  → saved to state.json`);
}

main().catch((e) => { console.error("\nPROVISION FAILED:", e.message); process.exit(1); });
