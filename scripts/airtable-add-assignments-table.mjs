// Create the PLAT_ASSIGNMENTS table in the CONTROL base — the central store for
// project-level RLS (docs/project-rls-activation.md, decision B). One row per
// (Org_Slug, Email, Job_Rec_Id): the member's per-project assignment. Read by
// listControlAssignments() → resolveJobScope(). Assignments live beside
// membership (PLAT_TEAM) in the control base, not in per-customer bases.
//
//   node scripts/airtable-add-assignments-table.mjs [controlBaseId]
//
// Defaults to AIRTABLE_CONTROL_BASE_ID from .env. Idempotent (skips if the
// table already exists). Needs a PAT with schema.bases:write on the control base.

import { readFileSync } from "node:fs";

function loadEnv(k) {
  if (process.env[k]) return process.env[k];
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${k}=`));
  return line ? line.slice(k.length + 1).trim() : "";
}

const baseId = process.argv[2] || loadEnv("AIRTABLE_CONTROL_BASE_ID");
if (!baseId) throw new Error("No control base id (arg or AIRTABLE_CONTROL_BASE_ID)");
const pat = loadEnv("AIRTABLE_PAT");
if (!pat) throw new Error("AIRTABLE_PAT not set");
const auth = { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" };
const meta = `https://api.airtable.com/v0/meta/bases/${baseId}`;

const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const tables = (await listRes.json()).tables;

if (tables.some((t) => t.name === "PLAT_ASSIGNMENTS")) {
  console.log(`= ${baseId}: PLAT_ASSIGNMENTS already exists — nothing to do.`);
  process.exit(0);
}

const res = await fetch(`${meta}/tables`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    name: "PLAT_ASSIGNMENTS",
    description: "Project-level RLS: one row per member's per-project (job) assignment.",
    fields: [
      { name: "Org_Slug", type: "singleLineText" }, // primary
      { name: "Email", type: "singleLineText" },
      { name: "Job_Rec_Id", type: "singleLineText" },
      { name: "Created_At", type: "date", options: { dateFormat: { name: "iso" } } },
    ],
  }),
});
if (!res.ok) throw new Error(`create PLAT_ASSIGNMENTS: HTTP ${res.status}: ${await res.text()}`);
const created = await res.json();
console.log(`+ ${baseId}: created PLAT_ASSIGNMENTS (tableId ${created.id})`);
