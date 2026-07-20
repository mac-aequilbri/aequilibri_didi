// Create the PLAT_REPORT_CATALOG table in the CONTROL base (reporting Phase 4).
// One row per saved report template: an org's custom promptSpec promoted to a
// reusable report definition that appears in the Reports dropdown.
//
//   node scripts/airtable-add-report-catalog-table.mjs [controlBaseId]
//
// Defaults to AIRTABLE_CONTROL_BASE_ID from .env. Idempotent. No seed — rows
// are created via "Save as template" in the app.

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

const text = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const check = (name) => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });

const TABLE = "PLAT_REPORT_CATALOG";
const FIELDS = [
  text("Key"), // primary — stable id used as the dropdown value ("tpl_…")
  text("Org_Slug"),
  text("Title"),
  long("Prompt"),
  long("Scopes"), // JSON array of ReportScope names
  text("Source"), // "saved" (from a custom report) | "curated"
  check("Is_Active"),
];

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
}

console.log("\nDone.");
