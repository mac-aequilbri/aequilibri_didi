// Governance Phase 1 — controlled-vocabulary retag (framework §5.5).
// Data-driven from scripts/data/governance-retag-map.json. DRY-RUN BY DEFAULT.
//
//   node scripts/airtable-retag-vocab.mjs --base appXXX            # dry-run report
//   node scripts/airtable-retag-vocab.mjs --base appXXX --apply    # HIGH rows only
//   node scripts/airtable-retag-vocab.mjs --base appXXX --apply --med  # + MED rows
//
// Rules enforced (§5.2): HIGH applies in batch; MED only with the explicit
// --med flag (after D3 sampling sign-off); REVIEW/unknown rows are NEVER
// applied — they land in retag-review-<base>.csv for human resolution.
// Apply mode also creates the new fields (ISSUES.Category, PROCUREMENT.
// Priority), adds missing canonical select options (never removes — rule 5 is
// a manual step), and writes one EXECUTION_LOG entry per retagged field.

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const BASE = opt("base");
const APPLY = flag("apply");
const MED = flag("med");
if (!BASE) { console.error("Usage: --base <appId> [--apply] [--med] [--map <path>]"); process.exit(1); }

const MAP = JSON.parse(readFileSync(new URL(opt("map") ?? "data/governance-retag-map.json", import.meta.url), "utf8"));

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
const api = (path) => `https://api.airtable.com/v0/${BASE}/${path}`;
const meta = (path = "") => `https://api.airtable.com/v0/meta/bases/${BASE}/tables${path}`;

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

async function patchRecords(table, updates) {
  for (let i = 0; i < updates.length; i += 10) {
    await call("PATCH", api(encodeURIComponent(table)), { records: updates.slice(i, i + 10) });
  }
}

// ── Schema pass ──────────────────────────────────────────────────────────────
const schema = (await call("GET", meta())).tables;
const tableByName = new Map(schema.map((t) => [t.name, t]));
const fieldOf = (t, name) => tableByName.get(t)?.fields.find((f) => f.name === name);
const problems = [];

for (const nf of MAP.newFields) {
  if (fieldOf(nf.table, nf.name)) continue;
  if (APPLY) {
    await call("POST", meta(`/${tableByName.get(nf.table).id}/fields`), {
      name: nf.name, type: "singleSelect", options: { choices: nf.options.map((name) => ({ name })) },
    });
    console.log(`+ created ${nf.table}.${nf.name}`);
  } else console.log(`~ would create ${nf.table}.${nf.name} (${nf.options.join(" · ")})`);
}

// Canonical values + explicit additions must exist as select options before any
// retag write (no typecast — off-vocabulary options must never auto-create).
async function ensureOptions(table, fieldName, wanted) {
  const f = fieldOf(table, fieldName);
  if (!f) { problems.push(`${table}.${fieldName}: field missing`); return; }
  if (f.type !== "singleSelect") { problems.push(`${table}.${fieldName}: not singleSelect (${f.type})`); return; }
  const have = new Set(f.options.choices.map((c) => c.name));
  const missing = wanted.filter((w) => !have.has(w));
  if (!missing.length) return;
  if (APPLY) {
    await call("PATCH", meta(`/${tableByName.get(table).id}/fields/${f.id}`), {
      options: { choices: [...f.options.choices, ...missing.map((name) => ({ name }))] },
    });
    console.log(`+ options ${table}.${fieldName}: ${missing.join(" · ")}`);
  } else console.log(`~ would add options ${table}.${fieldName}: ${missing.join(" · ")}`);
}

for (const ao of MAP.addOptions) await ensureOptions(ao.table, ao.field, ao.add);
for (const spec of MAP.fields) await ensureOptions(spec.table, spec.field, spec.canonical);

// ── Retag pass ───────────────────────────────────────────────────────────────
const review = [["table", "field", "recordId", "current", "proposed", "conf", "extraField", "extraValue"]];
const totals = { HIGH: 0, MED: 0, REVIEW: 0, unknown: 0, clean: 0, applied: 0 };

for (const spec of MAP.fields) {
  if (!fieldOf(spec.table, spec.field)) continue;
  // Extract/qualifier targets may not exist until apply mode creates them.
  const extraFields = new Set();
  for (const rule of Object.values(spec.map)) {
    const x = rule[2] ?? {};
    if (x.extract && fieldOf(spec.table, x.extract.field)) extraFields.add(x.extract.field);
    if (x.qualifierTo && fieldOf(spec.table, x.qualifierTo)) extraFields.add(x.qualifierTo);
  }
  const recs = await listAll(spec.table, [spec.field, ...extraFields]);
  const counts = {};
  const updates = [];

  for (const r of recs) {
    const cur = r.fields[spec.field];
    if (cur == null || cur === "") continue;
    if (spec.canonical.includes(cur)) { totals.clean++; continue; }
    const rule = spec.map[cur];
    if (!rule) {
      totals.unknown++;
      review.push([spec.table, spec.field, r.id, cur, "", "UNKNOWN", "", ""]);
      continue;
    }
    const [to, conf, x = {}] = rule;
    counts[`${cur} → ${to ?? "(review)"} [${conf}]`] = (counts[`${cur} → ${to ?? "(review)"} [${conf}]`] ?? 0) + 1;
    totals[conf]++;
    const apply = APPLY && (conf === "HIGH" || (conf === "MED" && MED));
    if (!apply) {
      review.push([spec.table, spec.field, r.id, cur, to ?? "", conf, x.extract?.field ?? "", x.extract?.value ?? ""]);
      continue;
    }
    const fields = { [spec.field]: to };
    if (x.extract) fields[x.extract.field] = x.extract.value;
    if (x.qualifierTo) {
      const prev = r.fields[x.qualifierTo];
      fields[x.qualifierTo] = prev ? `${prev}\n[Reversibility qualifier] ${cur}` : `[Reversibility qualifier] ${cur}`;
    }
    updates.push({ id: r.id, fields });
  }

  const label = `${spec.table}.${spec.field}`;
  console.log(`\n${label} — ${recs.length} records`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${v}× ${k}`);

  if (updates.length) {
    await patchRecords(spec.table, updates);
    totals.applied += updates.length;
    console.log(`  ✔ applied ${updates.length}`);
    const log = fieldOf("EXECUTION_LOG", "Initiated_By");
    const initiated = log?.options?.choices?.some((c) => c.name === "Human") ? { Initiated_By: "Human" } : {};
    await call("POST", api("EXECUTION_LOG"), {
      records: [{ fields: {
        Log_Entry: `Vocab retag: ${label}`,
        Date_Time: new Date().toISOString(),
        Status: "Done",
        Action_Type: "Update",
        Tables_Affected: spec.table,
        Summary: `governance-retag-map.json applied to ${updates.length} record(s): ${Object.entries(counts).map(([k, v]) => `${v}× ${k}`).join("; ")}`,
        ...initiated,
      } }],
    });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
if (problems.length) console.log(`\nSchema problems:\n  ${problems.join("\n  ")}`);
const csv = `retag-review-${BASE}.csv`;
writeFileSync(csv, review.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n"));
console.log(`\n${APPLY ? "APPLY" : "DRY-RUN"} — HIGH ${totals.HIGH} · MED ${totals.MED} · REVIEW ${totals.REVIEW} · unknown ${totals.unknown} · already clean ${totals.clean} · applied ${totals.applied}`);
console.log(`Review file: ${csv} (${review.length - 1} rows)`);
