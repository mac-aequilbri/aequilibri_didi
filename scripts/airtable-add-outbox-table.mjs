// Create the PLAT_OUTBOX table in the CONTROL base. This is the outbound event
// queue: the platform writes a `pending` row when a domain event fires (a
// proposal approved, a report sent, an assessment accepted); a single n8n
// Airtable-trigger watches this one table across all orgs, delivers via the
// right channel, and PATCHes the row to delivered/failed.
//
//   node scripts/airtable-add-outbox-table.mjs [controlBaseId]
//
// Defaults to AIRTABLE_CONTROL_BASE_ID from .env. Idempotent: skips the table
// if it already exists. No seed.

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
const numf = (name) => ({ name, type: "number", options: { precision: 0 } });

const TABLE = "PLAT_OUTBOX";
const FIELDS = [
  text("Event"), // primary — e.g. "report.ready", "decision.create"
  text("Org_Slug"),
  text("Entity_Type"),
  text("Entity_Id"),
  text("Job_Id"),
  long("Summary"),
  long("Payload"), // small JSON blob
  text("Status"), // pending | delivered | failed (n8n transitions)
  text("Created_At"),
  text("Delivered_At"),
  numf("Attempts"),
  long("Last_Error"),
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
