// Create the PLAT_JOB_CATALOG table in the CONTROL base and seed the curated
// construction + roofing job-category catalogs (from job-catalog-seed.json).
// This replaces the old hardcoded catalog in code: the app now reads categories
// per vertical from this table, and a brand-new industry gets an AI-drafted
// catalog at onboarding.
//
//   node scripts/airtable-seed-job-catalog.mjs [controlBaseId]
//
// Defaults to AIRTABLE_CONTROL_BASE_ID from .env. Idempotent: skips the table
// if it exists, and only seeds verticals that have no rows yet (so existing
// clients' catalogs are never duplicated or overwritten).

import { readFileSync } from "node:fs";

function env(key) {
  if (process.env[key]) return process.env[key];
  const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, "") : "";
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

const TABLE = "PLAT_JOB_CATALOG";
const FIELDS = [
  text("Key"), // primary
  text("Vertical_Key"),
  text("Label"),
  text("Category_Group"),
  text("Engagement_Type"),
  long("Scope_Hint"),
  long("Phases"), // JSON array of phase names
  numf("Sort_Order"),
  text("Source"),
  check("Is_Active"),
];

const seed = JSON.parse(readFileSync(new URL("./job-catalog-seed.json", import.meta.url), "utf8"));

// Flatten { vertical: [categories] } → Airtable field rows.
const rows = [];
for (const [verticalKey, cats] of Object.entries(seed)) {
  cats.forEach((c, i) => {
    rows.push({
      Key: c.key,
      Vertical_Key: verticalKey,
      Label: c.label,
      Category_Group: c.group,
      Engagement_Type: c.engagementType,
      Scope_Hint: c.scopeHint,
      Phases: JSON.stringify(c.phases),
      Sort_Order: i,
      Source: "curated",
      Is_Active: true,
    });
  });
}

// 1) Ensure the table exists.
const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const existing = (await listRes.json()).tables.find((t) => t.name === TABLE);
if (existing) {
  console.log(`✓ ${baseId}: ${TABLE} already exists`);
} else {
  const res = await fetch(`${meta}/tables`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ name: TABLE, fields: FIELDS }),
  });
  if (!res.ok) throw new Error(`create ${TABLE}: HTTP ${res.status}: ${await res.text()}`);
  console.log(`✓ ${baseId}: created ${TABLE}`);
  await sleep();
}

// 2) Which verticals already have rows? Skip those (don't duplicate/overwrite).
const dataUrl = `https://api.airtable.com/v0/${baseId}/${TABLE}`;
const seededVerticals = new Set();
let offset;
do {
  const url = new URL(dataUrl);
  url.searchParams.set("fields[]", "Vertical_Key");
  url.searchParams.set("pageSize", "100");
  if (offset) url.searchParams.set("offset", offset);
  const r = await fetch(url, { headers: auth });
  if (!r.ok) throw new Error(`scan rows: HTTP ${r.status}: ${await r.text()}`);
  const j = await r.json();
  for (const rec of j.records || []) {
    const v = rec.fields?.Vertical_Key;
    if (v) seededVerticals.add(v);
  }
  offset = j.offset;
} while (offset);

const toInsert = rows.filter((row) => !seededVerticals.has(row.Vertical_Key));
if (toInsert.length === 0) {
  console.log(`✓ ${baseId}: all verticals already seeded — nothing to do`);
} else {
  // Airtable caps 10 records per create request.
  for (let i = 0; i < toInsert.length; i += 10) {
    const batch = toInsert.slice(i, i + 10);
    const res = await fetch(dataUrl, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ records: batch.map((fields) => ({ fields })) }),
    });
    if (!res.ok) throw new Error(`seed batch: HTTP ${res.status}: ${await res.text()}`);
    await sleep(250);
  }
  const byVertical = {};
  for (const row of toInsert) byVertical[row.Vertical_Key] = (byVertical[row.Vertical_Key] || 0) + 1;
  console.log(
    `✓ ${baseId}: seeded ${toInsert.length} categories — ` +
      Object.entries(byVertical).map(([v, n]) => `${v}: ${n}`).join(", "),
  );
}

console.log("\nDone.");
