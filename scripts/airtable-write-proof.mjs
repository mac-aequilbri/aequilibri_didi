// Airtable write-path proof — creates a throwaway DECISIONS record in the demo
// base, reads it back, then deletes it. Self-cleaning: leaves no residue.
//
//   node scripts/airtable-write-proof.mjs
//
// Proves create + read-back + delete against the live API. Demo base only.

import { readFileSync } from "node:fs";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}

const BASE = "appharWaojouHgMeW"; // AEQUILIBRI_DIDI_DEMO
const TABLE = "tblsHgiXa0Efo3IWD"; // DECISIONS
const NAME_FIELD = "fldIDXimKr7PBC41e"; // Decision_Name (primary)
const pat = loadPat();
const auth = { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" };
const root = `https://api.airtable.com/v0/${BASE}/${TABLE}`;

async function call(method, path, body) {
  const res = await fetch(`${root}${path}`, {
    method,
    headers: auth,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

// 1. CREATE
const created = await call("POST", "", {
  records: [{ fields: { [NAME_FIELD]: "__migration_write_test__" } }],
  returnFieldsByFieldId: true,
});
const id = created.records[0].id;
console.log(`CREATE  ok -> ${id}`);

// 2. READ BACK
const read = await call("GET", `/${id}?returnFieldsByFieldId=true`);
console.log(`READ    ok -> Decision_Name = ${JSON.stringify(read.fields[NAME_FIELD])}`);

// 3. DELETE (cleanup)
const params = new URLSearchParams();
params.append("records[]", id);
await call("DELETE", `?${params}`);
console.log(`DELETE  ok -> ${id} removed (base left clean)`);
