// Print Module 1 schema-governance status from the control registry.
//
// Usage:
//   node scripts/airtable-module1-propagation-status.mjs [controlBaseId]

import { readFileSync } from "node:fs";

const controlBaseId = process.argv[2] ?? process.env.AIRTABLE_CONTROL_BASE_ID ?? "appV8j6dicv8ILzAx";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}

const token = loadPat();
const res = await fetch(`https://api.airtable.com/v0/${controlBaseId}/PLAT_ORG_REGISTRY?maxRecords=1000`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) throw new Error(`registry read failed: HTTP ${res.status}: ${await res.text()}`);

const records = (await res.json()).records;
for (const r of records) {
  const f = r.fields ?? {};
  let settings = {};
  try {
    settings = typeof f.Settings === "string" ? JSON.parse(f.Settings) : {};
  } catch {
    settings = {};
  }
  const schema = settings?.module1?.schema ?? {};
  const line = [
    String(f.Slug ?? ""),
    String(f.Name ?? ""),
    String(schema.coreVersion ?? "-"),
    String(schema.projectDeliveryVersion ?? "-"),
    String(schema.migrationStatus ?? "-"),
    String(schema.lastValidatedAt ?? "-"),
  ].join("\t");
  console.log(line);
}
