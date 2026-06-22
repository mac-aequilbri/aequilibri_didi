// Regenerate src/lib/airtable/schema.generated.ts from a live base's meta API.
//
//   node scripts/airtable-gen-schema.mjs [baseId]
//
// Defaults to the demo base. Reads AIRTABLE_PAT from .env or the environment.
// Emits the Core tables' stable table/field IDs as a typed `as const` module.

import { readFileSync, writeFileSync } from "node:fs";

const CORE = [
  // Core tier
  "ORGANISATIONS", "CONTACTS", "WORKSTREAMS", "DECISIONS", "ACTION_HUB",
  "EXECUTION_LOG", "CORRECTIONS", "JOBS", "HYPOTHESES", "LEARNING_RULES",
  "DOCUMENTS", "INTELLIGENCE_SNAPSHOT",
  // Domain Extension — Residential Project Delivery (skipped if absent)
  "RISKS", "VENDORS", "BUDGET", "CASHFLOW", "PROCUREMENT", "PHASES",
  "VARIATIONS", "QUOTES", "QUOTE_LINES", "ROOM_MATRIX", "MEETING_MINUTES",
  "WEEKLY_REPORTS", "PHASE_EVIDENCE", "BIM_MODELS",
  // Customer Config — app-shaped (skipped if absent)
  "PLAT_CFG_REFERENCE", "PLAT_CFG_REGION", "PLAT_CFG_NOMENCLATURE", "PLAT_CFG_SETTING",
  // Domain Extension — Roofing Estimation (UC1; skipped if absent)
  "ROOFING_CONTACTS", "ROOFING_RATE_CARDS", "ROOFING_FINANCE_PROVIDERS",
  "ROOFING_GUTTERING_RATES", "ROOFING_REGIONS", "ROOFING_TEAM",
  "ROOFING_SOLAR_PARTNERS", "ROOFING_WORKSTREAMS", "ROOFING_PRICE_CHECK_LOG",
  "ROOFING_ACTION_HUB", "ROOFING_EXECUTION_LOG",
  "ROOFING_INTELLIGENCE_SNAPSHOT", "ROOFING_CORRECTIONS", "ROOFING_HYPOTHESES",
  "ROOFING_LEARNING_RULES", "ROOFING_QUOTES", "ROOFING_QUOTE_ITEMS",
  "ROOFING_CONDITION_REPORTS", "ROOFING_PURCHASE_ORDERS", "ROOFING_STORM_EVENTS",
  "ROOFING_MEASUREMENT_SNAPSHOTS", "ROOFING_QUOTE_SNAPSHOTS", "ROOFING_STORM_LEADS",
  "ROOFING_PO_ITEMS",
];

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}

const baseId = process.argv[2] ?? "appharWaojouHgMeW";
const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
  headers: { Authorization: `Bearer ${loadPat()}` },
});
if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

const byName = new Map((await res.json()).tables.map((t) => [t.name, t]));
const out = [
  `// AUTO-GENERATED from base ${baseId} via the Airtable meta API.`,
  "// Source of truth for Core table/field IDs. Regenerate, do not hand-edit:",
  "//   node scripts/airtable-gen-schema.mjs",
  "",
  "export const CORE_SCHEMA = {",
];
for (const name of CORE) {
  const t = byName.get(name);
  if (!t) {
    console.warn(`skip ${name} (absent from base ${baseId})`);
    continue;
  }
  out.push(`  ${name}: {`);
  out.push(`    tableId: ${JSON.stringify(t.id)},`);
  out.push("    fields: [");
  for (const f of t.fields) {
    out.push(`      { name: ${JSON.stringify(f.name)}, id: ${JSON.stringify(f.id)}, type: ${JSON.stringify(f.type)} },`);
  }
  out.push("    ],");
  out.push("  },");
}
out.push("} as const;", "", "export type CoreTableName = keyof typeof CORE_SCHEMA;", "");

writeFileSync(new URL("../src/lib/airtable/schema.generated.ts", import.meta.url), out.join("\n"));
console.log(`wrote schema.generated.ts (${CORE.length} Core tables from ${baseId})`);
