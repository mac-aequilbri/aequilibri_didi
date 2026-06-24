// Module 1 core-governance audit:
// compares a target base against the template base for required core tables and
// field names.
//
// Usage:
//   node scripts/airtable-module1-audit-core.mjs <targetBaseId> [templateBaseId]
//
// Exits with code 1 when drift is detected.

import { readFileSync } from "node:fs";

const targetBaseId = process.argv[2];
const templateBaseId = process.argv[3] ?? process.env.AIRTABLE_TEMPLATE_BASE_ID ?? "appharWaojouHgMeW";

if (!targetBaseId) {
  console.error("Usage: node scripts/airtable-module1-audit-core.mjs <targetBaseId> [templateBaseId]");
  process.exit(1);
}

const REQUIRED = ["CORRECTIONS", "JOBS", "ORGANISATIONS", "INTELLIGENCE_SNAPSHOT", "LEARNING_RULES"];

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}

async function getTables(baseId, token) {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`failed reading ${baseId}: HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).tables;
}

const token = loadPat();
const [templateTables, targetTables] = await Promise.all([
  getTables(templateBaseId, token),
  getTables(targetBaseId, token),
]);

const templateByName = new Map(templateTables.map((t) => [t.name, t]));
const targetByName = new Map(targetTables.map((t) => [t.name, t]));

const failures = [];
for (const tableName of REQUIRED) {
  const template = templateByName.get(tableName);
  const target = targetByName.get(tableName);
  if (!template) {
    failures.push(`template missing required table ${tableName}`);
    continue;
  }
  if (!target) {
    failures.push(`target missing table ${tableName}`);
    continue;
  }

  const templateFields = new Set(template.fields.map((f) => f.name));
  const targetFields = new Set(target.fields.map((f) => f.name));
  for (const fieldName of templateFields) {
    if (!targetFields.has(fieldName)) {
      failures.push(`${tableName}: missing field ${fieldName}`);
    }
  }
}

if (failures.length) {
  console.error(`✗ Module 1 core audit failed (${targetBaseId})`);
  for (const msg of failures) console.error(`  - ${msg}`);
  process.exit(1);
}

console.log(`✓ Module 1 core audit passed for ${targetBaseId} (template ${templateBaseId})`);
