// Add a DECISIONS → JOBS link so decisions attach to their project.
//
//   node scripts/airtable-add-decision-job-link.mjs [baseId]
//
// The canonical Airtable DECISIONS table links to WORKSTREAMS/ACTION_HUB, not
// JOBS — but the app associates a decision with a job (PlatDecision.jobId), and
// it doesn't create a per-job workstream in Airtable to hang it off. So we add a
// direct "Job" multipleRecordLinks field on DECISIONS (reverse "DECISIONS" on
// JOBS, matching the other domain reverse links).
//
// Idempotent. RUN THIS ON the template base AND every already-provisioned client
// base (same as airtable-add-hypothesis-link.mjs). The data layer addresses
// fields by NAME, so the app works regardless of the field id.

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
const sleep = () => new Promise((r) => setTimeout(r, 250));

const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const tables = (await listRes.json()).tables;

const decisions = tables.find((t) => t.name === "DECISIONS");
const jobs = tables.find((t) => t.name === "JOBS");
if (!decisions) throw new Error("DECISIONS table not found in this base");
if (!jobs) throw new Error("JOBS table not found in this base");

if (decisions.fields.some((f) => f.name === "Job")) {
  console.log(`✓ ${baseId}: DECISIONS.Job already exists — nothing to do.`);
  process.exit(0);
}

const res = await fetch(`${meta}/tables/${decisions.id}/fields`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    name: "Job",
    type: "multipleRecordLinks",
    options: { linkedTableId: jobs.id },
  }),
});
if (!res.ok) throw new Error(`create DECISIONS.Job: HTTP ${res.status}: ${await res.text()}`);
const created = await res.json();
console.log(`✓ ${baseId}: created DECISIONS.Job -> JOBS`);

const reverseId = created.options?.inverseLinkFieldId;
if (reverseId) {
  await sleep();
  const pr = await fetch(`${meta}/tables/${jobs.id}/fields/${reverseId}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ name: "DECISIONS" }),
  });
  if (pr.ok) console.log(`✓ ${baseId}: renamed reverse JOBS.DECISIONS`);
  else console.error(`  could not rename reverse: HTTP ${pr.status}: ${await pr.text()}`);
}
