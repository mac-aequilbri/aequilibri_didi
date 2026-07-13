// Extend the Spec 12 CHANGE_LOG table with the variation-order fields the app
// carries that CHANGE_LOG lacks natively. Spec 12 dropped the legacy VARIATIONS
// table; a variation order is now a CHANGE_LOG row (Change_Type="Variation") —
// see fieldMaps.variation_order. CHANGE_LOG already covers cost/schedule impact,
// status, job link and dates; these five fields carry the rest of the app's
// variation shape so the mapping is lossless and partial-update safe. Additive +
// idempotent (existing fields skipped).
//
//   node scripts/airtable-extend-changelog.mjs [baseId ...]
//
// With no args it runs across the two vertical templates + the Dulong Downs Didi
// base. Safe to re-run.

import { readFileSync } from "node:fs";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}
const auth = { Authorization: `Bearer ${loadPat()}`, "Content-Type": "application/json" };
const sleep = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_BASES = ["appXfwBLE6zBEL5Zr", "appDSGE0EcAf2pRDZ", "appmDPKjRT4Kp9rvN"];
const bases = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_BASES;

const FIELDS = [
  { name: "Ref_Number", type: "singleLineText" },
  { name: "Scope_Change", type: "multilineText" },
  { name: "Is_AI_Drafted", type: "checkbox", options: { icon: "check", color: "greenBright" } },
  { name: "AI_Draft", type: "multilineText" },
  { name: "Approved_By", type: "singleLineText" },
];

async function meta(path, init) {
  const res = await fetch(`https://api.airtable.com/v0/meta/${path}`, { headers: auth, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`meta ${path}: HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

for (const baseId of bases) {
  console.log(`\n## ${baseId}`);
  let tables;
  try {
    ({ tables } = await meta(`bases/${baseId}/tables`));
  } catch (e) {
    console.error(`  cannot read schema: ${e.message}`);
    continue;
  }
  const cl = tables.find((t) => t.name === "CHANGE_LOG");
  if (!cl) {
    console.error("  CHANGE_LOG table absent — skipping");
    continue;
  }
  const have = new Set(cl.fields.map((f) => f.name));
  for (const f of FIELDS) {
    if (have.has(f.name)) {
      console.log(`  skip   ${f.name} (exists)`);
      continue;
    }
    try {
      const created = await meta(`bases/${baseId}/tables/${cl.id}/fields`, {
        method: "POST",
        body: JSON.stringify({ name: f.name, type: f.type, ...(f.options ? { options: f.options } : {}) }),
      });
      console.log(`  create ${f.name} -> ${created.id}`);
    } catch (e) {
      console.error(`  FAIL   ${f.name} -> ${e.message}`);
    }
    await sleep();
  }
}
console.log("\ndone.");
