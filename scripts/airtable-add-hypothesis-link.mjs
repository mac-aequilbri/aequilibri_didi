// Add the CORRECTIONS → HYPOTHESES link the learning loop needs.
//
//   node scripts/airtable-add-hypothesis-link.mjs [baseId]
//
// The canonical Airtable schema has no field tying a correction to the
// hypothesis that clusters it (the app's PlatCorrection.hypothesisId). Without
// it the corrections→hypotheses engine can't run on Airtable. This adds a
// "Hypothesis" multipleRecordLinks field on CORRECTIONS pointing at HYPOTHESES
// and renames the auto-created reverse on HYPOTHESES to "Corrections".
//
// Idempotent: if CORRECTIONS already has a "Hypothesis" field it is left alone,
// so it is safe to re-run. RUN THIS ON:
//   1. the template base (AIRTABLE_TEMPLATE_BASE_ID) — so newly provisioned
//      client bases clone the field automatically; and
//   2. every already-provisioned client base (they were cloned before the
//      field existed).
// After running on the template, re-run scripts/airtable-gen-schema.mjs (or
// hand-update schema.generated.ts) so the field id is captured — though the
// data layer addresses fields by NAME, so the app works regardless of the id.

import { readFileSync } from "node:fs";

const baseId = process.argv[2] ?? "appharWaojouHgMeW";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}
const auth = { Authorization: `Bearer ${loadPat()}`, "Content-Type": "application/json" };
const meta = `https://api.airtable.com/v0/meta/bases/${baseId}`;
const sleep = () => new Promise((r) => setTimeout(r, 250)); // respect rate limit

const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const tables = (await listRes.json()).tables;

const corrections = tables.find((t) => t.name === "CORRECTIONS");
const hypotheses = tables.find((t) => t.name === "HYPOTHESES");
if (!corrections) throw new Error("CORRECTIONS table not found in this base");
if (!hypotheses) throw new Error("HYPOTHESES table not found in this base");

if (corrections.fields.some((f) => f.name === "Hypothesis")) {
  console.log(`✓ ${baseId}: CORRECTIONS.Hypothesis already exists — nothing to do.`);
  process.exit(0);
}

const res = await fetch(`${meta}/tables/${corrections.id}/fields`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    name: "Hypothesis",
    type: "multipleRecordLinks",
    options: { linkedTableId: hypotheses.id },
  }),
});
if (!res.ok) throw new Error(`create CORRECTIONS.Hypothesis: HTTP ${res.status}: ${await res.text()}`);
const created = await res.json();
console.log(`✓ ${baseId}: created CORRECTIONS.Hypothesis -> HYPOTHESES`);

// Rename the auto-created reverse field on HYPOTHESES (default name = "CORRECTIONS")
// to "Corrections" so both sides read cleanly by name.
const reverseId = created.options?.inverseLinkFieldId;
if (reverseId) {
  await sleep();
  const pr = await fetch(`${meta}/tables/${hypotheses.id}/fields/${reverseId}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ name: "Corrections" }),
  });
  if (pr.ok) console.log(`✓ ${baseId}: renamed reverse HYPOTHESES.Corrections`);
  else console.error(`  could not rename reverse: HTTP ${pr.status}: ${await pr.text()}`);
}
