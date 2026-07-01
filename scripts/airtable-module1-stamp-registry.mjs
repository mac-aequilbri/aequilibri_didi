// Stamp Module 1 governance metadata into control registry settings for orgs
// missing the `module1` payload.
//
// Usage:
//   node scripts/airtable-module1-stamp-registry.mjs [controlBaseId]

import { readFileSync } from "node:fs";

const controlBaseId = process.argv[2] ?? process.env.AIRTABLE_CONTROL_BASE_ID ?? "appV8j6dicv8ILzAx";
const CORE_VERSION = "2026.06-core-m1";
const PROJECT_DELIVERY_VERSION = "2026.06-project-delivery-m1";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}

const token = loadPat();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const listRes = await fetch(`https://api.airtable.com/v0/${controlBaseId}/PLAT_ORG_REGISTRY?maxRecords=1000`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!listRes.ok) throw new Error(`registry read failed: HTTP ${listRes.status}: ${await listRes.text()}`);

const module1 = {
  schema: {
    coreVersion: CORE_VERSION,
    projectDeliveryVersion: PROJECT_DELIVERY_VERSION,
    migrationStatus: "planned",
    lastValidatedAt: "",
  },
  onboarding: {
    loadSequence: [
      "project phases",
      "room/zone matrix",
      "vendor list",
      "reference data",
      "opening budget",
      "ongoing operational data",
    ],
    requiredCoreTables: ["CORRECTIONS", "JOBS", "ORGANISATIONS", "INTELLIGENCE_SNAPSHOT"],
  },
  domainModel: {
    projectDeliveryTables: [
      "ISSUES",
      "CHANGE_LOG",
      "PROCUREMENT",
      "CASHFLOWS",
      "BUDGET",
      "ROOM_MATRIX",
      "VENDORS",
      "PHASES",
      "PLAN",
      "REF_CATEGORIES",
      "REF_ZONES",
      "REF_BUDGET",
    ],
    customerConfigValues: [
      "vendor records",
      "budget values",
      "zone names",
      "team members",
      "pricing overrides",
    ],
  },
};

const records = (await listRes.json()).records;
for (const r of records) {
  const settingsRaw = typeof r.fields?.Settings === "string" ? r.fields.Settings : "{}";
  let settings = {};
  try {
    settings = JSON.parse(settingsRaw);
  } catch {
    settings = {};
  }
  if (settings.module1) continue;
  const next = { ...settings, module1 };
  const patchRes = await fetch(`https://api.airtable.com/v0/${controlBaseId}/PLAT_ORG_REGISTRY`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      records: [{ id: r.id, fields: { Settings: JSON.stringify(next) } }],
      typecast: true,
    }),
  });
  if (!patchRes.ok) {
    throw new Error(`failed stamping ${r.id}: HTTP ${patchRes.status}: ${await patchRes.text()}`);
  }
  console.log(`+ stamped ${r.fields?.Slug ?? r.id}`);
}

console.log("✓ module1 governance stamp complete");
