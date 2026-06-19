// Airtable connectivity probe — proves the read path end-to-end against a live
// base without touching the app. Reads AIRTABLE_PAT from .env (or the env).
//
//   node scripts/airtable-probe.mjs [baseId] [tableId]
//
// Defaults to the demo base + DECISIONS table. Read-only: it lists records and
// prints a summary; it never writes.

import { readFileSync } from "node:fs";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
    if (line) return line.slice("AIRTABLE_PAT=".length).trim();
  } catch {
    /* no .env */
  }
  throw new Error("AIRTABLE_PAT not found in env or .env");
}

const baseId = process.argv[2] ?? "appharWaojouHgMeW"; // AEQUILIBRI_DIDI_DEMO
const tableId = process.argv[3] ?? "tblsHgiXa0Efo3IWD"; // DECISIONS
const pat = loadPat();

const url = `https://api.airtable.com/v0/${baseId}/${tableId}?maxRecords=3&returnFieldsByFieldId=true`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
console.log(`OK — base ${baseId}, table ${tableId}`);
console.log(`records returned: ${data.records.length}`);
for (const r of data.records) {
  console.log(`  ${r.id}  (${Object.keys(r.fields).length} fields populated)`);
}
