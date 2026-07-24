// Add an ISSUES → JOBS link so actions attach to their project.
//
//   node scripts/airtable-add-issues-job-link.mjs [baseId]
//
// The Airtable ISSUES table (a.k.a. ACTION_HUB pre-rename) has no Job field, so
// the job picked on the "new action" form was silently dropped on write in
// Airtable mode (the `action` field-map had no Job spec, and the table had no
// column to receive it). Postgres persisted it via PlatIssue.jobId; Airtable did
// not. This mirrors airtable-add-decision-job-link.mjs: add a direct "Job"
// multipleRecordLinks field on ISSUES (reverse "ISSUES" on JOBS, matching the
// other domain reverse links). Paired with the `action` field-map Job spec.
//
// Idempotent. RUN THIS ON every template base AND every provisioned client base.
// The data layer addresses fields by NAME, so the app works regardless of id.

import { readFileSync } from "node:fs";

const baseId = process.argv[2] ?? "appXfwBLE6zBEL5Zr"; // construction template

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

// Post- or pre-rename table name.
const issues = tables.find((t) => t.name === "ISSUES") ?? tables.find((t) => t.name === "ACTION_HUB");
const jobs = tables.find((t) => t.name === "JOBS");
if (!issues) throw new Error("ISSUES / ACTION_HUB table not found in this base");
if (!jobs) throw new Error("JOBS table not found in this base");

if (issues.fields.some((f) => f.name === "Job")) {
  console.log(`= ${baseId}: ${issues.name}.Job already exists — nothing to do.`);
  process.exit(0);
}

const res = await fetch(`${meta}/tables/${issues.id}/fields`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    name: "Job",
    type: "multipleRecordLinks",
    options: { linkedTableId: jobs.id },
  }),
});
if (!res.ok) throw new Error(`create ${issues.name}.Job: HTTP ${res.status}: ${await res.text()}`);
const created = await res.json();
console.log(`+ ${baseId}: created ${issues.name}.Job -> JOBS  (fieldId ${created.id})`);

const reverseId = created.options?.inverseLinkFieldId;
if (reverseId) {
  await sleep();
  const pr = await fetch(`${meta}/tables/${jobs.id}/fields/${reverseId}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ name: "ISSUES" }),
  });
  if (pr.ok) console.log(`  ↳ renamed reverse JOBS.ISSUES`);
  else console.error(`  ↳ could not rename reverse: HTTP ${pr.status}: ${await pr.text()}`);
}
