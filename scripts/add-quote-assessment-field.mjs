// Runbook: add the QUOTES → ASSESSMENTS link field to an Airtable base.
//
// Why: UC3's proposal gate (assessment → proposal → accept → project) stores a
// proposal as a QUOTES record linked to its source assessment. The app emits
// that link as the "Assessment" field on QUOTES; without the field present in
// the base, appToFields silently drops it and accepting a proposal no-ops in
// Airtable mode. This script adds the field via the Metadata API.
//
// Discipline (per the build spec): customer bases are clones, not live-linked,
// so schema changes are a DELIBERATE, TRACKED migration — run this against the
// Master Template first, eyeball the result, then against each customer base
// (the same job the "migrate base up" dashboard does). It is:
//   • dry-run by default — pass --apply to actually create the field
//   • idempotent — skips a base that already has the field
//
// Usage:
//   AIRTABLE_PAT=pat… node scripts/add-quote-assessment-field.mjs                 # dry-run, template base
//   AIRTABLE_PAT=pat… node scripts/add-quote-assessment-field.mjs --apply         # create on template base
//   AIRTABLE_PAT=pat… node scripts/add-quote-assessment-field.mjs app123 app456 --apply
//   AIRTABLE_PAT=pat… node scripts/add-quote-assessment-field.mjs --all-mapped --apply
//
// The PAT needs schema.bases:write on the target base(s).
// After applying to a base whose schema seeds CORE_SCHEMA, regenerate
// src/lib/airtable/schema.generated.ts so the app knows the new field.

import { readFileSync } from "node:fs";

const META = "https://api.airtable.com/v0/meta";
const QUOTES_TABLE = "QUOTES";
const ASSESSMENTS_TABLE = "ASSESSMENTS";
const FIELD_NAME = "Assessment";

// ── env (prefer the shell; fall back to a minimal .env parse for local runs) ──
function loadEnv() {
  const env = { ...process.env };
  if (!env.AIRTABLE_PAT || !env.AIRTABLE_TEMPLATE_BASE_ID || !env.AIRTABLE_BASES) {
    try {
      for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* no .env — rely on the shell */
    }
  }
  return env;
}

const env = loadEnv();
const PAT = env.AIRTABLE_PAT;
if (!PAT) {
  console.error("AIRTABLE_PAT is not set (needs schema.bases:write). Aborting.");
  process.exit(1);
}

async function metaFetch(path, init) {
  const res = await fetch(`${META}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Airtable meta ${init?.method ?? "GET"} ${path}: HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

// ── resolve target bases ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allMapped = args.includes("--all-mapped");
const positional = args.filter((a) => !a.startsWith("--"));

const bases = new Set(positional);
if (allMapped) {
  try {
    Object.values(JSON.parse(env.AIRTABLE_BASES ?? "{}")).forEach((id) => bases.add(String(id)));
  } catch {
    console.error("AIRTABLE_BASES is not valid JSON; cannot expand --all-mapped.");
    process.exit(1);
  }
}
if (bases.size === 0) {
  if (!env.AIRTABLE_TEMPLATE_BASE_ID) {
    console.error("No base id given and AIRTABLE_TEMPLATE_BASE_ID is unset.");
    process.exit(1);
  }
  bases.add(env.AIRTABLE_TEMPLATE_BASE_ID);
}

console.log(`Mode: ${apply ? "APPLY (will create fields)" : "DRY-RUN (no writes)"}`);
console.log(`Target base(s): ${[...bases].join(", ")}\n`);

let created = 0;
let skipped = 0;
let failed = 0;

for (const baseId of bases) {
  try {
    const { tables } = await metaFetch(`bases/${baseId}/tables`);
    const quotes = tables.find((t) => t.name === QUOTES_TABLE);
    const assessments = tables.find((t) => t.name === ASSESSMENTS_TABLE);
    if (!quotes) throw new Error(`no ${QUOTES_TABLE} table`);
    if (!assessments) throw new Error(`no ${ASSESSMENTS_TABLE} table`);

    const existing = quotes.fields.find((f) => f.name === FIELD_NAME);
    if (existing) {
      console.log(`• ${baseId}: ${QUOTES_TABLE}.${FIELD_NAME} already exists (${existing.id}, ${existing.type}) — skip`);
      skipped += 1;
      continue;
    }

    if (!apply) {
      console.log(
        `• ${baseId}: WOULD create ${QUOTES_TABLE}.${FIELD_NAME} → link to ${ASSESSMENTS_TABLE} (${assessments.id})`,
      );
      continue;
    }

    const field = await metaFetch(`bases/${baseId}/tables/${quotes.id}/fields`, {
      method: "POST",
      body: JSON.stringify({
        name: FIELD_NAME,
        type: "multipleRecordLinks",
        options: { linkedTableId: assessments.id },
      }),
    });
    console.log(
      `• ${baseId}: created ${QUOTES_TABLE}.${FIELD_NAME} → ${field.id} (Airtable auto-added the inverse field on ${ASSESSMENTS_TABLE})`,
    );
    created += 1;
  } catch (err) {
    console.error(`• ${baseId}: FAILED — ${err instanceof Error ? err.message : err}`);
    failed += 1;
  }
}

console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
if (created > 0) {
  console.log(
    "\nNext: regenerate src/lib/airtable/schema.generated.ts (or add the field manually) so\n" +
      'the app resolves "Assessment" on QUOTES — until then the link still drops on write.',
  );
}
// Set the code and let Node drain naturally — calling process.exit() while
// fetch keep-alive sockets are closing trips a libuv assertion on Windows.
process.exitCode = failed > 0 ? 1 : 0;
