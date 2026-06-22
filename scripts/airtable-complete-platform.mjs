// Complete the Platform (UC2/UC3) Airtable schema: the tables and fields the
// Domain Extension + Config tiers still lack. Companion to
// airtable-create-domain.mjs (which created the first Domain tables).
//
//   node scripts/airtable-complete-platform.mjs [baseId]
//
// Idempotent: existing tables (by name) and existing fields (by name) are
// skipped, so it is safe to re-run. Config tables are created APP-SHAPED
// (PLAT_CFG_*) to match the Prisma models 1:1 — the canonical REFERENCE_DATA/
// REGIONS/NOMENCLATURE_OVERRIDES template tables are left untouched.

import { readFileSync } from "node:fs";

const baseId = process.argv[2] ?? "appharWaojouHgMeW";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}
const auth = { Authorization: `Bearer ${loadPat()}`, "Content-Type": "application/json" };
const meta = `https://api.airtable.com/v0/meta/bases/${baseId}`;
const sleep = () => new Promise((r) => setTimeout(r, 250)); // respect rate limit

// ── field builders ──────────────────────────────────────────────────────
const text = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const url = (name) => ({ name, type: "url" });
const numf = (name, precision = 0) => ({ name, type: "number", options: { precision } });
const money = (name) => ({ name, type: "currency", options: { precision: 2, symbol: "$" } });
const check = (name) => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });
const date = (name) => ({ name, type: "date", options: { dateFormat: { name: "iso" } } });
const link = (name, linkedTableId) => ({ name, type: "multipleRecordLinks", options: { linkedTableId } });

// ── load current base state ─────────────────────────────────────────────
const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const tables = (await listRes.json()).tables;
const byName = new Map(tables.map((t) => [t.name, t]));
const idOf = (name) => {
  const t = byName.get(name);
  if (!t) throw new Error(`expected table ${name} to exist (link target)`);
  return t.id;
};

// ── new tables (first field = primary) ──────────────────────────────────
const NEW_TABLES = {
  QUOTE_LINES: [
    text("Description"), text("Category"), numf("Qty", 2), text("Unit"),
    money("Unit_Price"), money("Line_Total"), numf("Sort_Order"),
    link("Quote", idOf("QUOTES")),
  ],
  PHASE_EVIDENCE: [
    text("Note"), text("Added_By"),
    link("Phase", idOf("PHASES")), link("Document", idOf("DOCUMENTS")), link("Job", idOf("JOBS")),
  ],
  BIM_MODELS: [
    text("Name"), text("Provider"), url("Embed_URL"), check("Client_Visible"),
    text("Added_By"), long("Notes"), link("Job", idOf("JOBS")),
  ],
  PLAT_CFG_REFERENCE: [
    text("Name"), text("Ref_Type"), text("Code"), long("Value"), numf("Sort_Order"), check("Is_Active"),
  ],
  PLAT_CFG_REGION: [
    text("Region_Name"), long("Postcodes"), numf("Travel_Days"), numf("Premium_Pct", 2), check("Is_Active"),
  ],
  PLAT_CFG_NOMENCLATURE: [text("Customer_Term"), text("Standard_Term")],
  PLAT_CFG_SETTING: [text("Setting_Key"), long("Value")],
};

// ── fields to add to existing tables ────────────────────────────────────
const ADD_FIELDS = {
  ROOM_MATRIX: [long("Finishes")],
  WEEKLY_REPORTS: [date("Generated_At"), date("Approved_At"), date("Sent_At")],
  MEETING_MINUTES: [long("Extracted_Actions"), date("Confirmed_At")],
  VARIATIONS: [check("Is_AI_Drafted"), long("AI_Draft")],
};

// ── create tables ───────────────────────────────────────────────────────
for (const [name, fields] of Object.entries(NEW_TABLES)) {
  if (byName.has(name)) {
    console.log(`skip table   ${name} (exists)`);
    continue;
  }
  const res = await fetch(`${meta}/tables`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ name, fields }),
  });
  if (res.ok) {
    const t = await res.json();
    byName.set(name, t);
    console.log(`create table ${name} -> ${t.id}`);
  } else {
    console.error(`FAIL table   ${name} -> HTTP ${res.status}: ${await res.text()}`);
  }
  await sleep();
}

// ── add fields ──────────────────────────────────────────────────────────
for (const [tableName, fields] of Object.entries(ADD_FIELDS)) {
  const t = byName.get(tableName);
  if (!t) {
    console.error(`FAIL field   ${tableName} (table absent)`);
    continue;
  }
  const existing = new Set(t.fields.map((f) => f.name));
  for (const f of fields) {
    if (existing.has(f.name)) {
      console.log(`skip field   ${tableName}.${f.name} (exists)`);
      continue;
    }
    const res = await fetch(`${meta}/tables/${t.id}/fields`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(f),
    });
    if (res.ok) {
      const created = await res.json();
      console.log(`add field    ${tableName}.${f.name} -> ${created.id}`);
    } else {
      console.error(`FAIL field   ${tableName}.${f.name} -> HTTP ${res.status}: ${await res.text()}`);
    }
    await sleep();
  }
}
console.log("done.");
