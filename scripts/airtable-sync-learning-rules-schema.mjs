// Reconcile LEARNING_RULES field schema from the template base into a target
// base by creating missing fields with matching types/options.
//
// Usage:
//   node scripts/airtable-sync-learning-rules-schema.mjs <targetBaseId> [templateBaseId]

import { readFileSync } from "node:fs";

const targetBaseId = process.argv[2];
const templateBaseId = process.argv[3] ?? process.env.AIRTABLE_TEMPLATE_BASE_ID ?? "appharWaojouHgMeW";

if (!targetBaseId) {
  console.error("Usage: node scripts/airtable-sync-learning-rules-schema.mjs <targetBaseId> [templateBaseId]");
  process.exit(1);
}

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
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const CREATABLE = new Set([
  "singleLineText",
  "multilineText",
  "singleSelect",
  "multipleSelects",
  "number",
  "percent",
  "currency",
  "checkbox",
  "date",
  "dateTime",
  "phoneNumber",
  "email",
  "url",
  "richText",
]);
const [templateTables, targetTables] = await Promise.all([
  getTables(templateBaseId, token),
  getTables(targetBaseId, token),
]);

const template = templateTables.find((t) => t.name === "LEARNING_RULES");
const target = targetTables.find((t) => t.name === "LEARNING_RULES");
if (!template || !target) {
  throw new Error("LEARNING_RULES table not found in template or target base");
}

const targetFieldNames = new Set(target.fields.map((f) => f.name));
const missing = template.fields.filter((f) => !targetFieldNames.has(f.name));

if (!missing.length) {
  console.log(`✓ ${targetBaseId}: LEARNING_RULES already aligned`);
  process.exit(0);
}

for (const field of missing) {
  if (!CREATABLE.has(field.type)) {
    console.log(`~ skipped non-creatable field type ${field.type} for ${field.name}`);
    continue;
  }
  const body = { name: field.name, type: field.type };
  if (field.options) body.options = field.options;
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${targetBaseId}/tables/${target.id}/fields`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `failed creating LEARNING_RULES.${field.name}: HTTP ${res.status}: ${await res.text()}`,
    );
  }
  console.log(`+ created LEARNING_RULES.${field.name}`);
}

console.log(`✓ ${targetBaseId}: LEARNING_RULES schema reconciled with template ${templateBaseId}`);
