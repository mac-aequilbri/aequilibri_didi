// Create the PLAT_TEMPLATE_REGISTRY table in the CONTROL base and seed the
// existing industry→sub-industry→template mappings. This is what lets new
// industries be onboarded by adding a row (via /app/templates) instead of a
// code change — the /app/new dropdown and onboarding resolve templates from it.
//
//   node scripts/airtable-add-template-registry.mjs [controlBaseId]
//
// Defaults to AIRTABLE_CONTROL_BASE_ID from .env. Idempotent: skips the table
// if it exists, and only seeds when the table is empty.

import { readFileSync } from "node:fs";

function env(key) {
  if (process.env[key]) return process.env[key];
  const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  return line ? line.slice(key.length + 1).trim() : "";
}

const pat = env("AIRTABLE_PAT");
if (!pat) throw new Error("AIRTABLE_PAT not found");
const baseId = process.argv[2] || env("AIRTABLE_CONTROL_BASE_ID");
if (!baseId) throw new Error("No control base id (pass as arg or set AIRTABLE_CONTROL_BASE_ID)");

const auth = { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" };
const meta = `https://api.airtable.com/v0/meta/bases/${baseId}`;
const sleep = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const text = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const numf = (name) => ({ name, type: "number", options: { precision: 0 } });
const check = (name) => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });

const TABLE = "PLAT_TEMPLATE_REGISTRY";
const FIELDS = [
  text("Industry"), // primary
  text("Sub_Industry"),
  text("Vertical_Key"),
  text("Template_Base_Id"),
  numf("Sort_Order"),
  long("Notes"),
  check("Is_Active"),
];

// Seed = the mappings previously hardcoded in VERTICAL_TEMPLATE_BASE_IDS.
const SEED = [
  { Industry: "Construction", Sub_Industry: "Project Delivery", Vertical_Key: "construction", Template_Base_Id: "appXfwBLE6zBEL5Zr", Sort_Order: 1, Is_Active: true },
  { Industry: "Roofing", Sub_Industry: "PCR Estimation", Vertical_Key: "roofing", Template_Base_Id: "appDSGE0EcAf2pRDZ", Sort_Order: 2, Is_Active: true },
];

const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const existing = (await listRes.json()).tables.find((t) => t.name === TABLE);

if (existing) {
  console.log(`✓ ${baseId}: ${TABLE} already exists`);
} else {
  const res = await fetch(`${meta}/tables`, { method: "POST", headers: auth, body: JSON.stringify({ name: TABLE, fields: FIELDS }) });
  if (!res.ok) throw new Error(`create ${TABLE}: HTTP ${res.status}: ${await res.text()}`);
  console.log(`✓ ${baseId}: created ${TABLE}`);
}

// Seed only if empty (idempotent re-run safety).
await sleep();
const recRes = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}?maxRecords=1`, { headers: auth });
const recs = (await recRes.json()).records || [];
if (recs.length) {
  console.log(`✓ ${baseId}: ${TABLE} already has rows — skipping seed`);
} else {
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${TABLE}`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ records: SEED.map((fields) => ({ fields })) }),
  });
  if (!res.ok) throw new Error(`seed ${TABLE}: HTTP ${res.status}: ${await res.text()}`);
  console.log(`✓ ${baseId}: seeded ${SEED.length} mappings (Construction, Roofing)`);
}

console.log("\nDone.");
