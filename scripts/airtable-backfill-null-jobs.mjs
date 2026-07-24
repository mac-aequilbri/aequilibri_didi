// Report (and optionally backfill) records with no Job link across the
// job-scoped tables in each org's base — the RLS "null job = visible to all"
// tightening (docs/project-general-bucket-plan.md, phase M).
//
//   node scripts/airtable-backfill-null-jobs.mjs                 # dry report, all orgs
//   node scripts/airtable-backfill-null-jobs.mjs --org=<slug> --target=<recId> --apply
//
// DRY BY DEFAULT — reports null-job counts per table per org and mutates nothing.
// Apply mode is deliberately per-org + explicit target: "null → General" is only
// correct where null genuinely means org-level; for a multi-project org a null
// job usually means "unlinked to its real project", so blanket General is wrong.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const orgArg = (args.find((a) => a.startsWith("--org=")) || "").slice("--org=".length);
const target = (args.find((a) => a.startsWith("--target=")) || "").slice("--target=".length);

function envval(k) {
  if (process.env[k]) return process.env[k];
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${k}=`));
  return line ? line.slice(k.length + 1).trim() : "";
}
const CTRL = envval("AIRTABLE_CONTROL_BASE_ID");
const auth = { Authorization: `Bearer ${envval("AIRTABLE_PAT")}`, "Content-Type": "application/json" };
const api = (base, path) => `https://api.airtable.com/v0/${base}/${path}`;

// Job-scoped Airtable tables (Job link). Read tolerantly — not all exist per base.
const TABLES = ["ISSUES", "DECISIONS", "RISKS", "PROCUREMENT", "PHASES", "BUDGET", "CASHFLOWS", "CHANGE_LOG", "ROOM_MATRIX", "DOCUMENTS", "QUOTES", "COMMS"];
const CAP = 1000;

/** Read up to CAP records of a table; return {records, capped} or null if absent. */
async function readTable(base, table) {
  const out = [];
  let offset;
  do {
    const u = new URL(api(base, table));
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, { headers: auth });
    if (!r.ok) return null; // table absent / unreadable
    const j = await r.json();
    out.push(...j.records);
    offset = j.offset;
  } while (offset && out.length < CAP);
  return { records: out, capped: Boolean(offset) };
}

const isNullJob = (rec) => {
  const j = rec.fields.Job;
  return !Array.isArray(j) || j.length === 0;
};

const reg = await getReg();
async function getReg() {
  const j = await (await fetch(api(CTRL, "PLAT_ORG_REGISTRY?maxRecords=100"), { headers: auth })).json();
  return j.records.map((r) => ({ slug: r.fields.Slug, base: r.fields.Airtable_Base_Id, settings: safe(r.fields.Settings) }));
}
function safe(s) { try { return JSON.parse(s || "{}"); } catch { return {}; } }

for (const org of reg) {
  if (!org.base) continue;
  if (orgArg && org.slug !== orgArg) continue;
  console.log(`\n=== ${org.slug}  (General=${org.settings.generalJobId ?? "—"}) ===`);
  for (const table of TABLES) {
    const res = await readTable(org.base, table);
    if (!res) continue; // absent
    const nulls = res.records.filter(isNullJob);
    if (res.records.length === 0) continue;
    const flag = res.capped ? ` (capped at ${CAP}+)` : "";
    console.log(`  ${table}: ${nulls.length} null-job of ${res.records.length}${flag}`);

    if (APPLY && orgArg && target && nulls.length) {
      let done = 0;
      let ok = true;
      for (let i = 0; i < nulls.length && ok; i += 10) {
        const batch = nulls.slice(i, i + 10).map((r) => ({ id: r.id, fields: { Job: [target] } }));
        const pr = await fetch(api(org.base, table), { method: "PATCH", headers: auth, body: JSON.stringify({ records: batch, typecast: true }) });
        if (!pr.ok) { console.log(`    ! ${table} PATCH failed HTTP ${pr.status}: ${await pr.text()} — ${done}/${nulls.length} updated, aborting this table`); ok = false; break; }
        done += batch.length;
      }
      if (ok) console.log(`    ↳ set Job=${target} on ${done} record(s)`);
    }
  }
}
console.log(APPLY ? "\n✓ apply done" : "\n(dry run — nothing changed; pass --org= --target= --apply to backfill one org)");
