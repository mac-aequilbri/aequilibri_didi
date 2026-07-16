// Governance Phase 5 — reference/master-data conversion (§5.1 class 3):
// convert a free text/select category field into linked records against a
// master table, so new values are added deliberately, never ad hoc.
// DRY-RUN BY DEFAULT. Sequenced after the Phase 1 retag (plan P10).
//
//   node scripts/airtable-link-master-data.mjs --base appX --table CASHFLOWS \
//     --field Category --master REF_CATEGORIES --master-field Name [--apply]
//
// Airtable cannot change a field's type, so the conversion is additive:
// 1. distinct source values → master rows (created when missing)
// 2. a new "<field>_Link" multipleRecordLinks field to the master table
// 3. every record's link set from its current text value
// The original field is left in place; retiring it is a manual step (same
// rule as §5.2 rule 5). Re-runnable: existing master rows/links are reused.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const APPLY = args.includes("--apply");
const BASE = opt("base"), TABLE = opt("table"), FIELD = opt("field");
const MASTER = opt("master"), MASTER_FIELD = opt("master-field") ?? "Name";
if (!BASE || !TABLE || !FIELD || !MASTER) {
  console.error("Usage: --base <appId> --table <T> --field <F> --master <M> [--master-field Name] [--apply]");
  process.exit(1);
}
const LINK_FIELD = opt("link-field") ?? `${FIELD}_Link`;

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}
const auth = { Authorization: `Bearer ${loadPat()}`, "Content-Type": "application/json" };
async function call(method, url, body) {
  const res = await fetch(url, { method, headers: auth, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${await res.text()}`);
  return res.json();
}
const api = (p) => `https://api.airtable.com/v0/${BASE}/${p}`;
const meta = (p = "") => `https://api.airtable.com/v0/meta/bases/${BASE}/tables${p}`;

async function listAll(table, fields) {
  const recs = [];
  let offset = "";
  do {
    const qs = fields.map((f) => `fields%5B%5D=${encodeURIComponent(f)}`).join("&");
    const page = await call("GET", api(`${encodeURIComponent(table)}?pageSize=100&${qs}${offset ? `&offset=${offset}` : ""}`));
    recs.push(...page.records);
    offset = page.offset ?? "";
  } while (offset);
  return recs;
}

const schema = (await call("GET", meta())).tables;
const src = schema.find((t) => t.name === TABLE);
const master = schema.find((t) => t.name === MASTER);
if (!src || !master) throw new Error(`Table missing: ${!src ? TABLE : MASTER}`);
if (!src.fields.some((f) => f.name === FIELD)) throw new Error(`${TABLE}.${FIELD} missing`);

// 1. Distinct source values + master lookup
const rows = await listAll(TABLE, [FIELD]);
const values = new Map(); // value → count
for (const r of rows) {
  const v = typeof r.fields[FIELD] === "string" ? r.fields[FIELD].trim() : "";
  if (v) values.set(v, (values.get(v) ?? 0) + 1);
}
const masterRows = await listAll(MASTER, [MASTER_FIELD]);
const masterByValue = new Map(masterRows.map((r) => [String(r.fields[MASTER_FIELD] ?? "").trim(), r.id]));
const missingMaster = [...values.keys()].filter((v) => !masterByValue.has(v));

console.log(`${TABLE}.${FIELD}: ${rows.length} records · ${values.size} distinct values`);
console.log(`${MASTER}: ${masterRows.length} rows · ${missingMaster.length} to create`);
if (missingMaster.length) console.log(`  new master rows: ${missingMaster.join(" · ")}`);

const linkExists = src.fields.some((f) => f.name === LINK_FIELD);
console.log(`${TABLE}.${LINK_FIELD}: ${linkExists ? "exists" : APPLY ? "will create" : "would create"}`);

if (!APPLY) {
  console.log(`\nDRY-RUN — would link ${[...values.values()].reduce((a, b) => a + b, 0)} records. Re-run with --apply.`);
  process.exit(0);
}

// 2. Create missing master rows + the link field
for (let i = 0; i < missingMaster.length; i += 10) {
  const created = await call("POST", api(encodeURIComponent(MASTER)), {
    records: missingMaster.slice(i, i + 10).map((v) => ({ fields: { [MASTER_FIELD]: v } })),
  });
  created.records.forEach((r) => masterByValue.set(String(r.fields[MASTER_FIELD]).trim(), r.id));
}
if (!linkExists) {
  await call("POST", meta(`/${src.id}/fields`), {
    name: LINK_FIELD,
    type: "multipleRecordLinks",
    options: { linkedTableId: master.id },
  });
}

// 3. Set links (only where the link would change)
const withLinks = await listAll(TABLE, [FIELD, LINK_FIELD]);
const updates = [];
for (const r of withLinks) {
  const v = typeof r.fields[FIELD] === "string" ? r.fields[FIELD].trim() : "";
  const target = v ? masterByValue.get(v) : undefined;
  if (!target) continue;
  const cur = Array.isArray(r.fields[LINK_FIELD]) ? r.fields[LINK_FIELD] : [];
  if (cur.length === 1 && cur[0] === target) continue;
  updates.push({ id: r.id, fields: { [LINK_FIELD]: [target] } });
}
for (let i = 0; i < updates.length; i += 10) {
  await call("PATCH", api(encodeURIComponent(TABLE)), { records: updates.slice(i, i + 10) });
}

// Audit entry (canonical vocabulary — §5.3)
await call("POST", api("EXECUTION_LOG"), {
  records: [{ fields: {
    Log_Entry: `Master-data link: ${TABLE}.${FIELD} → ${MASTER}`,
    Date_Time: new Date().toISOString(),
    Status: "Done",
    Action_Type: "Update",
    Tables_Affected: `${TABLE}, ${MASTER}`,
    Summary: `${updates.length} record(s) linked via ${LINK_FIELD}; ${missingMaster.length} master row(s) created. Original ${FIELD} retained (manual retirement).`,
  } }],
});
console.log(`APPLIED — linked ${updates.length} · master rows created ${missingMaster.length}`);
