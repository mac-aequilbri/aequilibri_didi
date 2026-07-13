// Extend the lean Spec 12 DOCUMENTS table with the fields the app's data layer
// already assumes (fieldMaps.document + documents.ts). The Spec 12 vertical
// templates ship a DOCUMENTS with only Drive-URL-level metadata ("Drive URLs
// only, no content in Airtable"), so the generic codec layer silently DROPS
// Text_Content / AI_Analysis / Job / etc. on write — losing the body of every
// generated document (weekly reports, quote snapshots) and the module2/module4
// metadata. This backfills those fields additively (idempotent: existing fields
// are skipped) so DOCUMENTS can hold a full generated artifact.
//
//   node scripts/airtable-extend-documents.mjs [baseId ...]
//
// With no args it runs across the two vertical templates + the Dulong Downs Didi
// base. Safe to re-run. The Job link's auto-created reverse on JOBS is renamed
// to "DOCUMENTS".

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

// Default fleet: construction template, roofing template, Dulong Downs Didi.
const DEFAULT_BASES = ["appXfwBLE6zBEL5Zr", "appDSGE0EcAf2pRDZ", "appmDPKjRT4Kp9rvN"];
const bases = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_BASES;

// Fields to add to DOCUMENTS (by name). `link` fields carry a linkedTable NAME
// resolved per-base + an inverse name to rename the auto-created reverse.
const FIELDS = [
  { name: "Uploaded_By", type: "singleLineText" },
  { name: "Storage_Provider", type: "singleLineText" },
  { name: "Text_Content", type: "multilineText" },
  { name: "AI_Summary", type: "multilineText" },
  { name: "AI_Analysis", type: "multilineText" },
  { name: "Confidence", type: "number", options: { precision: 0 } },
  {
    name: "Analyzed_At",
    type: "dateTime",
    options: { dateFormat: { name: "iso" }, timeZone: "utc", timeFormat: { name: "24hour" } },
  },
  { name: "Job", type: "multipleRecordLinks", link: "JOBS", inverse: "DOCUMENTS" },
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
  const docs = tables.find((t) => t.name === "DOCUMENTS");
  if (!docs) {
    console.error("  DOCUMENTS table absent — skipping");
    continue;
  }
  const have = new Set(docs.fields.map((f) => f.name));
  for (const f of FIELDS) {
    if (have.has(f.name)) {
      console.log(`  skip   ${f.name} (exists)`);
      continue;
    }
    let body;
    if (f.type === "multipleRecordLinks") {
      const target = tables.find((t) => t.name === f.link);
      if (!target) {
        console.error(`  FAIL   ${f.name} -> link target ${f.link} absent`);
        continue;
      }
      body = { name: f.name, type: "multipleRecordLinks", options: { linkedTableId: target.id } };
    } else {
      body = { name: f.name, type: f.type, ...(f.options ? { options: f.options } : {}) };
    }
    try {
      const created = await meta(`bases/${baseId}/tables/${docs.id}/fields`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      console.log(`  create ${f.name} -> ${created.id}`);
      // Rename the auto-created reverse link on the target table.
      if (f.type === "multipleRecordLinks" && f.inverse) {
        const target = tables.find((t) => t.name === f.link);
        const revId = created.options?.inverseLinkFieldId;
        if (revId) {
          await sleep();
          try {
            await meta(`bases/${baseId}/tables/${target.id}/fields/${revId}`, {
              method: "PATCH",
              body: JSON.stringify({ name: f.inverse }),
            });
            console.log(`         reverse on ${f.link} -> "${f.inverse}"`);
          } catch (e) {
            console.error(`         reverse rename failed: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.error(`  FAIL   ${f.name} -> ${e.message}`);
    }
    await sleep();
  }
}
console.log("\ndone.");
