// Provision a per-org "General" project — the shared bucket for org-level
// records (docs/project-general-bucket-plan.md). For every org in the control
// registry: ensure a JOBS record named "General" exists in the org's customer
// base, and record its rec id in the org's registry Settings.generalJobId (which
// flows into ctx.config.generalJobId and keeps General in RLS scope for all).
//
//   node scripts/airtable-provision-general-job.mjs [--dry]
//
// Idempotent: skips an org whose Settings.generalJobId already points at a live
// record; otherwise reuses an existing "General" job by name or creates one.

import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
function envval(k) {
  if (process.env[k]) return process.env[k];
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${k}=`));
  return line ? line.slice(k.length + 1).trim() : "";
}
const CTRL = envval("AIRTABLE_CONTROL_BASE_ID");
const auth = { Authorization: `Bearer ${envval("AIRTABLE_PAT")}`, "Content-Type": "application/json" };
const api = (base, path) => `https://api.airtable.com/v0/${base}/${path}`;
const getJson = async (url) => (await fetch(url, { headers: auth })).json();

const GENERAL_NAME = "General";
const GENERAL_DESC = "Organisation-wide items not tied to a specific project.";

const reg = await getJson(api(CTRL, "PLAT_ORG_REGISTRY?maxRecords=100"));
for (const row of reg.records) {
  const f = row.fields;
  const slug = f.Slug ?? "?";
  const base = f.Airtable_Base_Id;
  if (!base) { console.log(`- ${slug}: no base id — skip`); continue; }

  let settings = {};
  try { settings = JSON.parse(f.Settings || "{}"); } catch { /* start clean */ }

  // Already provisioned + still live?
  if (settings.generalJobId) {
    const rec = await getJson(api(base, `JOBS/${settings.generalJobId}`));
    if (rec && rec.id) { console.log(`= ${slug}: General job ${settings.generalJobId} exists — skip`); continue; }
  }

  // Reuse an existing "General" job by name, else create one.
  const existing = await getJson(api(base, `JOBS?filterByFormula=${encodeURIComponent(`{Job_Name}='${GENERAL_NAME}'`)}&maxRecords=1`));
  let jobId = existing.records?.[0]?.id ?? null;
  if (DRY) { console.log(`~ ${slug}: would ${jobId ? `reuse ${jobId}` : "create General job"} + store id`); continue; }
  if (!jobId) {
    const res = await fetch(api(base, "JOBS"), {
      method: "POST", headers: auth,
      body: JSON.stringify({ fields: { Job_Name: GENERAL_NAME, Description: GENERAL_DESC }, typecast: true }),
    });
    const j = await res.json();
    if (!res.ok) { console.log(`! ${slug}: create failed HTTP ${res.status}: ${JSON.stringify(j)}`); continue; }
    jobId = j.id;
    console.log(`+ ${slug}: created General job ${jobId}`);
  } else {
    console.log(`= ${slug}: reusing existing General job ${jobId}`);
  }

  settings.generalJobId = jobId;
  const pr = await fetch(api(CTRL, "PLAT_ORG_REGISTRY"), {
    method: "PATCH", headers: auth,
    body: JSON.stringify({ records: [{ id: row.id, fields: { Settings: JSON.stringify(settings) } }] }),
  });
  console.log(pr.ok ? `  ↳ ${slug}: stored generalJobId in registry` : `  ↳ ${slug}: store FAILED HTTP ${pr.status}`);
}
console.log("\n✓ done");
