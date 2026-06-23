// Create the control-plane tables in the shared CONTROL base, so the platform
// can resolve orgs + authenticate without Postgres.
//
//   node scripts/airtable-create-control-base.mjs <controlBaseId>
//
// Creates (idempotently):
//   PLAT_ORG_REGISTRY — one row per org (Slug → Org_Id, Airtable_Base_Id,
//                       Settings JSON, engagement config, Is_Active)
//   PLAT_TEAM         — members (Org_Slug, Email, Role) for auth
//
// The control base is a single shared base (NOT a per-customer base). Put its id
// in AIRTABLE_CONTROL_BASE_ID (env / Render) — that's what flips the platform to
// reading org identity from Airtable instead of Postgres.

import { readFileSync } from "node:fs";

const baseId = process.argv[2];
if (!baseId) {
  console.error("usage: node scripts/airtable-create-control-base.mjs <controlBaseId>");
  process.exit(1);
}

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}
const auth = { Authorization: `Bearer ${loadPat()}`, "Content-Type": "application/json" };
const meta = `https://api.airtable.com/v0/meta/bases/${baseId}`;

const text = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const numf = (name) => ({ name, type: "number", options: { precision: 0 } });
const check = (name) => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });

const TABLES = [
  {
    name: "PLAT_ORG_REGISTRY",
    fields: [
      text("Slug"), // primary
      numf("Org_Id"),
      text("Name"),
      text("Vertical"),
      text("Default_Engagement_Type"),
      long("Allowed_Engagement_Types"),
      text("Ai_Authority"),
      long("Settings"),
      text("Airtable_Base_Id"),
      check("Is_Active"),
    ],
  },
  {
    name: "PLAT_TEAM",
    fields: [
      text("Name"), // primary
      text("Org_Slug"),
      text("Email"),
      text("Role"),
      check("Is_Active"),
    ],
  },
];

const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const existing = new Set((await listRes.json()).tables.map((t) => t.name));

for (const t of TABLES) {
  if (existing.has(t.name)) {
    console.log(`✓ ${baseId}: ${t.name} already exists`);
    continue;
  }
  const res = await fetch(`${meta}/tables`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ name: t.name, fields: t.fields }),
  });
  if (!res.ok) throw new Error(`create ${t.name}: HTTP ${res.status}: ${await res.text()}`);
  console.log(`✓ ${baseId}: created ${t.name}`);
}
console.log(`\nDone. Set AIRTABLE_CONTROL_BASE_ID=${baseId} (local .env + Render) to activate.`);
