// Create the PLAT_CONNECTIONS table in the CONTROL base. This is the per-org
// integration registry: one row per (org, channel, direction) recording whether
// a channel is enabled, a pointer to its n8n credential, and delivery health.
// Managed from /app/[org]/integrations; read by /api/platform/hooks (default-deny
// gate) and the admin page.
//
//   node scripts/airtable-add-connections-table.mjs [controlBaseId]
//
// Defaults to AIRTABLE_CONTROL_BASE_ID from .env. Idempotent: skips the table if
// it already exists. No seed — connections are created per org via the UI.

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

const TABLE = "PLAT_CONNECTIONS";
const FIELDS = [
  text("Connection_Key"), // primary = `${orgSlug}:${channel}:${direction}`
  text("Org_Slug"),
  text("Channel"),
  text("Direction"), // "in" | "out" (only "in" is functional today)
  check("Is_Active"),
  long("Event_Filter"),
  text("Credential_Ref"), // points to the n8n credential — never a secret
  text("Last_Event_At"),
  text("Last_Status"),
  long("Notes"),
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
