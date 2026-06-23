// Add the ASSESSMENTS table the intake engine needs (P3).
//
//   node scripts/airtable-add-assessments-table.mjs [baseId]
//
// The assessment draft (PlatAssessment) had no Airtable home, so the
// onboard→assess→accept engine kept it Postgres-only. This creates a thin
// ASSESSMENTS table: scalar intake columns + a Result long-text holding the
// StoredAssessment JSON blob (same shape Postgres stores in `result`) + a Job
// link set on acceptance.
//
// Idempotent. RUN THIS ON the template base (so new client bases clone it) AND
// every already-provisioned client base. Needs a valid PAT.

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

const text = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const numf = (name) => ({ name, type: "number", options: { precision: 0 } });

const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const tables = (await listRes.json()).tables;

const jobs = tables.find((t) => t.name === "JOBS");
if (!jobs) throw new Error("JOBS table not found in this base");

let assessments = tables.find((t) => t.name === "ASSESSMENTS");
if (assessments) {
  console.log(`✓ ${baseId}: ASSESSMENTS table already exists.`);
} else {
  const res = await fetch(`${meta}/tables`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "ASSESSMENTS",
      // First field is the primary field.
      fields: [
        text("Assessment_Name"),
        text("Engagement_Type"),
        text("Address"),
        text("Suburb"),
        numf("Size_Sqm"),
        long("Scope"),
        long("Result"),
        {
          name: "Status",
          type: "singleSelect",
          options: { choices: [{ name: "draft" }, { name: "accepted" }, { name: "discarded" }] },
        },
        text("Prompt_Version"),
        text("Created_By"),
      ],
    }),
  });
  if (!res.ok) throw new Error(`create ASSESSMENTS: HTTP ${res.status}: ${await res.text()}`);
  assessments = await res.json();
  console.log(`✓ ${baseId}: created ASSESSMENTS table`);
}

// Add the Job link (reverse "ASSESSMENTS" on JOBS) if missing.
if (assessments.fields?.some((f) => f.name === "Job")) {
  console.log(`✓ ${baseId}: ASSESSMENTS.Job already exists.`);
} else {
  await sleep();
  const res = await fetch(`${meta}/tables/${assessments.id}/fields`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "Job",
      type: "multipleRecordLinks",
      options: { linkedTableId: jobs.id },
    }),
  });
  if (!res.ok) throw new Error(`create ASSESSMENTS.Job: HTTP ${res.status}: ${await res.text()}`);
  const created = await res.json();
  console.log(`✓ ${baseId}: created ASSESSMENTS.Job -> JOBS`);
  const reverseId = created.options?.inverseLinkFieldId;
  if (reverseId) {
    await sleep();
    const pr = await fetch(`${meta}/tables/${jobs.id}/fields/${reverseId}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ name: "ASSESSMENTS" }),
    });
    if (pr.ok) console.log(`✓ ${baseId}: renamed reverse JOBS.ASSESSMENTS`);
    else console.error(`  could not rename reverse: HTTP ${pr.status}: ${await pr.text()}`);
  }
}
