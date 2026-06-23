// Provision a new per-customer Airtable base by replicating the STRUCTURE of a
// template base (default: the demo base). This is the "programmatic structure"
// onboarding mechanism: Airtable has no clone-base API, so we read the
// template's full schema (with field options) and rebuild it in a fresh base.
//
//   node scripts/airtable-provision-base.mjs --name "Client Co"            (dry run)
//   node scripts/airtable-provision-base.mjs --name "Client Co" \
//        --workspace wspXXXXXXXX --execute                                  (creates)
//
//   --from <baseId>        template to copy structure from (default: demo base)
//   --include-roofing      also replicate the UC1 ROOFING_* tables
//   --execute              actually create the base (otherwise dry-run plan only)
//
// Two-pass build: tables are created with their SIMPLE fields first (so every
// link target exists), then multipleRecordLinks fields are added. Computed
// fields (formula/rollup/lookup/count/...) cannot be created via the API and
// are reported for manual setup. Idempotent on re-run against an existing base
// id passed via --from is NOT the intent — this always creates a NEW base.

import { readFileSync } from "node:fs";

// ── args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const FROM = opt("from", "appharWaojouHgMeW"); // demo base
const NAME = opt("name", "");
const WORKSPACE = opt("workspace", "");
const INCLUDE_ROOFING = flag("include-roofing");
const EXECUTE = flag("execute");

if (!NAME) {
  console.error("ERROR: --name is required (the new base's display name).");
  process.exit(1);
}
if (EXECUTE && !WORKSPACE) {
  console.error("ERROR: --execute requires --workspace <wsp...> (where to create the base).");
  process.exit(1);
}

// ── auth ────────────────────────────────────────────────────────────────
function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found in env or .env");
  return line.slice("AIRTABLE_PAT=".length).trim();
}
const auth = { Authorization: `Bearer ${loadPat()}`, "Content-Type": "application/json" };
const sleep = (ms = 250) => new Promise((r) => setTimeout(r, ms));

// ── which tables make up a platform (UC2/UC3) base ─────────────────────────
// These are the tables the app's fieldMaps actually read/write. The template
// base also has TEAM and PRICING tables that Core tables link to (Owner,
// Assigned_To, etc.), but team/identity is kept Postgres-side by design (the
// base IS the org), so they are intentionally NOT copied — links pointing at
// them are skipped in pass 2. Add them here if client bases should carry team.
const PLATFORM_TABLES = new Set([
  "ORGANISATIONS", "CONTACTS", "WORKSTREAMS", "DECISIONS", "ACTION_HUB",
  "EXECUTION_LOG", "CORRECTIONS", "JOBS", "HYPOTHESES", "LEARNING_RULES",
  "DOCUMENTS", "INTELLIGENCE_SNAPSHOT", "ASSESSMENTS",
  "RISKS", "VENDORS", "BUDGET", "CASHFLOW", "PROCUREMENT", "PHASES",
  "VARIATIONS", "QUOTES", "QUOTE_LINES", "ROOM_MATRIX", "MEETING_MINUTES",
  "WEEKLY_REPORTS", "PHASE_EVIDENCE", "BIM_MODELS",
  "PLAT_CFG_REFERENCE", "PLAT_CFG_REGION", "PLAT_CFG_NOMENCLATURE", "PLAT_CFG_SETTING",
]);
const isRoofing = (name) => name.startsWith("ROOFING_");
const wanted = (name) =>
  PLATFORM_TABLES.has(name) || (INCLUDE_ROOFING && isRoofing(name));

// ── field classification ────────────────────────────────────────────────
// Computed fields cannot be created through the API (no inbound config).
const COMPUTED = new Set([
  "formula", "rollup", "count", "multipleLookupValues", "lookup",
  "createdTime", "lastModifiedTime", "createdBy", "lastModifiedBy",
  "autoNumber", "button", "externalSyncSource", "aiText",
]);
const isLink = (f) => f.type === "multipleRecordLinks";
const isComputed = (f) => COMPUTED.has(f.type);
const isSimple = (f) => !isLink(f) && !isComputed(f);

// Strip option keys the create-field API rejects (ids of choices, linked
// table/field ids that belong to the template base, etc.). Keep the shaping
// options (precision, symbol, dateFormat, choices-by-name, icon/color).
function cleanOptions(field) {
  const o = field.options;
  if (!o) return undefined;
  if (field.type === "singleSelect" || field.type === "multipleSelects") {
    return { choices: (o.choices ?? []).map((c) => ({ name: c.name, ...(c.color ? { color: c.color } : {}) })) };
  }
  if (field.type === "currency") return { precision: o.precision ?? 2, symbol: o.symbol ?? "$" };
  if (field.type === "number" || field.type === "percent" || field.type === "duration")
    return { precision: o.precision ?? 0, ...(o.durationFormat ? { durationFormat: o.durationFormat } : {}) };
  if (field.type === "date") return { dateFormat: o.dateFormat ?? { name: "iso" } };
  if (field.type === "dateTime")
    return { dateFormat: o.dateFormat ?? { name: "iso" }, timeZone: o.timeZone ?? "utc", timeFormat: o.timeFormat ?? { name: "24hour" } };
  if (field.type === "checkbox") return { icon: o.icon ?? "check", color: o.color ?? "greenBright" };
  if (field.type === "rating") return { icon: o.icon ?? "star", color: o.color ?? "yellowBright", max: o.max ?? 5 };
  return undefined; // text/url/email/phone/etc. take no options
}
const simpleFieldSpec = (f) => {
  const opts = cleanOptions(f);
  return { name: f.name, type: f.type, ...(opts ? { options: opts } : {}) };
};

// ── read the template schema (WITH options) ───────────────────────────────
async function readSchema(baseId) {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers: auth });
  if (!res.ok) throw new Error(`read schema: HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).tables;
}

async function main() {
  const all = await readSchema(FROM);
  const tables = all.filter((t) => wanted(t.name));
  const missing = [...PLATFORM_TABLES].filter((n) => !all.some((t) => t.name === n));

  // Plan: per table, partition fields. Primary = first simple field (Airtable
  // requires the primary field to be a non-link, non-computed type).
  const plan = tables.map((t) => {
    const simple = t.fields.filter(isSimple);
    const links = t.fields.filter(isLink);
    const computed = t.fields.filter(isComputed);
    const primary = simple[0] ?? null;
    const rest = simple.slice(1);
    return { name: t.name, primary, rest, links, computed };
  });

  // ── report ──────────────────────────────────────────────────────────────
  console.log(`Template base : ${FROM}`);
  console.log(`New base name : ${NAME}`);
  console.log(`Workspace     : ${WORKSPACE || "(none — dry run)"}`);
  console.log(`Mode          : ${EXECUTE ? "EXECUTE (will create)" : "DRY RUN (no writes)"}`);
  console.log(`Tables to copy: ${plan.length}${INCLUDE_ROOFING ? " (incl. roofing)" : ""}`);
  if (missing.length) console.log(`! template is missing platform tables: ${missing.join(", ")}`);
  let totalSimple = 0, totalLinks = 0, totalComputed = 0;
  const computedReport = [];
  for (const p of plan) {
    totalSimple += 1 + p.rest.length;
    totalLinks += p.links.length;
    totalComputed += p.computed.length;
    if (!p.primary) console.log(`  ! ${p.name}: no creatable primary field (all link/computed) — needs a manual primary`);
    if (p.computed.length) computedReport.push(`  ${p.name}: ${p.computed.map((f) => `${f.name}(${f.type})`).join(", ")}`);
  }
  console.log(`\nFields: ${totalSimple} simple (created in pass 1), ${totalLinks} links (pass 2), ${totalComputed} computed (MANUAL).`);
  if (computedReport.length) {
    console.log(`\nComputed fields the API cannot create — set up manually after provisioning:`);
    console.log(computedReport.join("\n"));
  }

  if (!EXECUTE) {
    console.log(`\nDry run complete. Re-run with --workspace <wsp...> --execute to create the base.`);
    return;
  }

  // ── pass 0: create the base with the first table (createBase needs >=1) ──
  const [first, ...others] = plan;
  if (!first?.primary) throw new Error(`first table ${first?.name} has no creatable primary field`);
  const createBody = {
    name: NAME,
    workspaceId: WORKSPACE,
    tables: [{ name: first.name, fields: [simpleFieldSpec(first.primary), ...first.rest.map(simpleFieldSpec)] }],
  };
  const cRes = await fetch("https://api.airtable.com/v0/meta/bases", {
    method: "POST", headers: auth, body: JSON.stringify(createBody),
  });
  if (!cRes.ok) throw new Error(`createBase: HTTP ${cRes.status}: ${await cRes.text()}`);
  const created = await cRes.json();
  const newBaseId = created.id;
  const idByName = new Map(created.tables.map((t) => [t.name, t.id]));
  console.log(`\ncreated base ${newBaseId} (table ${first.name} -> ${idByName.get(first.name)})`);
  const metaUrl = `https://api.airtable.com/v0/meta/bases/${newBaseId}`;

  // ── pass 1: remaining tables with their simple fields ────────────────────
  for (const p of others) {
    if (!p.primary) { console.error(`  SKIP table ${p.name} (no creatable primary)`); continue; }
    await sleep();
    const body = { name: p.name, fields: [simpleFieldSpec(p.primary), ...p.rest.map(simpleFieldSpec)] };
    const r = await fetch(`${metaUrl}/tables`, { method: "POST", headers: auth, body: JSON.stringify(body) });
    if (r.ok) { const t = await r.json(); idByName.set(p.name, t.id); console.log(`  table ${p.name} -> ${t.id}`); }
    else console.error(`  FAIL table ${p.name}: HTTP ${r.status}: ${await r.text()}`);
  }

  // ── pass 2: link fields (every table now exists) ─────────────────────────
  // Creating a multipleRecordLinks field makes Airtable auto-generate the
  // symmetric reverse field in the target table — with a DEFAULT name (the
  // source table's name), not the template's. We create one side per pair
  // (tracked via inverseLinkFieldId) and then rename the auto-created reverse to
  // the template's inverse field name so the app can address both sides by name.
  const handledLinkIds = new Set();
  const templateFieldName = (fieldId) => {
    for (const t of all) {
      const f = t.fields.find((x) => x.id === fieldId);
      if (f) return f.name;
    }
    return undefined;
  };
  for (const p of plan) {
    const tableId = idByName.get(p.name);
    if (!tableId) continue;
    for (const f of p.links) {
      if (handledLinkIds.has(f.id)) continue; // its pair was already created (reverse auto-made)
      const targetName = all.find((t) => t.id === f.options?.linkedTableId)?.name ?? null;
      const linkedTableId = targetName ? idByName.get(targetName) : null;
      if (!linkedTableId) { console.error(`  SKIP link ${p.name}.${f.name} (target ${targetName ?? "?"} not in new base)`); continue; }
      await sleep();
      const body = { name: f.name, type: "multipleRecordLinks", options: { linkedTableId } };
      const r = await fetch(`${metaUrl}/tables/${tableId}/fields`, { method: "POST", headers: auth, body: JSON.stringify(body) });
      if (!r.ok) { console.error(`  FAIL link ${p.name}.${f.name}: HTTP ${r.status}: ${await r.text()}`); continue; }
      const created = await r.json();
      console.log(`  link ${p.name}.${f.name} -> ${targetName}`);
      handledLinkIds.add(f.id);
      const tmplInvId = f.options?.inverseLinkFieldId;
      if (tmplInvId) {
        handledLinkIds.add(tmplInvId);
        const wantName = templateFieldName(tmplInvId);
        const newInvId = created.options?.inverseLinkFieldId;
        if (wantName && newInvId) {
          await sleep();
          const pr = await fetch(`${metaUrl}/tables/${linkedTableId}/fields/${newInvId}`, {
            method: "PATCH", headers: auth, body: JSON.stringify({ name: wantName }),
          });
          if (pr.ok) console.log(`    reverse ${targetName}.${wantName}`);
          else console.error(`    FAIL rename reverse -> ${wantName}: HTTP ${pr.status}: ${await pr.text()}`);
        }
      }
    }
  }

  console.log(`\nDONE. New base: ${newBaseId}`);
  console.log(`Register it: add "${'<org-slug>'}":"${newBaseId}" to AIRTABLE_BASES (or the airtableBaseId column).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
