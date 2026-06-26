// Spec 10 — Phase 0 additive Core-schema migration.
//
//   node scripts/airtable-spec10-core-schema.mjs [baseId]
//
// Brings a base up to the Spec 10 "21-table Core" shape, additively (no renames,
// no deletes — safe to run on a live base):
//   1. COMMS            — new Core coordination table (who gets told what, when).
//   2. PHASES fields    — Phase_Type, Loop_Permitted, RAG, Sequence,
//                         Predecessor_Phase (self-link), Season_Year.
//   3. ISSUES fields    — Issue_Type, Phase (link), Linked_Risk (link) on the
//                         ACTION_HUB table (the eventual ISSUES rename is a
//                         separate, deliberate migration).
//
// Idempotent: every create checks for existence first. RUN THIS ON the template
// base (so new client bases clone it) AND every already-provisioned client base.
// Needs a valid PAT with schema.bases:write.
//
// NOT covered here (separate steps): ACTION_HUB->ISSUES table rename,
// CASHFLOW->CASHFLOWS rename, DOMAIN_LABELS/PLAN/CHANGE_LOG classification.

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
const sleep = () => new Promise((r) => setTimeout(r, 300));

// ── field builders ───────────────────────────────────────────────────────────
const text = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const numf = (name) => ({ name, type: "number", options: { precision: 0 } });
const dat = (name) => ({ name, type: "date", options: { dateFormat: { name: "iso" } } });
const sel = (name, choices) => ({ name, type: "singleSelect", options: { choices: choices.map((c) => ({ name: c })) } });
const check = (name) => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });
const link = (name, linkedTableId) => ({ name, type: "multipleRecordLinks", options: { linkedTableId } });

// ── load tables ──────────────────────────────────────────────────────────────
const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
let tables = (await listRes.json()).tables;
const byName = (n) => tables.find((t) => t.name === n);
async function refresh() {
  const r = await fetch(`${meta}/tables`, { headers: auth });
  tables = (await r.json()).tables;
}

const jobs = byName("JOBS");
const contacts = byName("CONTACTS");
const phases = byName("PHASES");
const decisions = byName("DECISIONS");
const issuesTbl = byName("ISSUES") ?? byName("ACTION_HUB"); // post- or pre-rename
const risks = byName("RISKS");
if (!jobs) throw new Error("JOBS not found");

// Add a field to a table if absent; optionally PATCH-rename the auto-created
// reverse link on the target table so clones reproduce a clean name.
async function addField(table, field, reverseName) {
  const existing = byName(table.name);
  if (existing?.fields?.some((f) => f.name === field.name)) {
    console.log(`  = ${table.name}.${field.name} exists`);
    return;
  }
  await sleep();
  const res = await fetch(`${meta}/tables/${table.id}/fields`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(field),
  });
  if (!res.ok) throw new Error(`create ${table.name}.${field.name}: HTTP ${res.status}: ${await res.text()}`);
  const created = await res.json();
  console.log(`  + ${table.name}.${field.name}`);
  if (reverseName && field.type === "multipleRecordLinks" && created.options?.inverseLinkFieldId) {
    await sleep();
    const linkedId = field.options.linkedTableId;
    const pr = await fetch(`${meta}/tables/${linkedId}/fields/${created.options.inverseLinkFieldId}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ name: reverseName }),
    });
    if (pr.ok) console.log(`    ↳ reverse renamed to ${reverseName}`);
    else console.error(`    ↳ reverse rename failed: HTTP ${pr.status}`);
  }
}

// ── 1. COMMS ───────────────────────────────────────────────────────────────
console.log(`\n[${baseId}] COMMS`);
let comms = byName("COMMS");
if (comms) {
  console.log("  = COMMS table exists");
} else {
  const res = await fetch(`${meta}/tables`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "COMMS",
      fields: [
        text("Topic"), // primary
        sel("Message_Type", ["Decision Notification", "Status Update", "Action Required", "Approval Request", "Escalation"]),
        sel("Stakeholder_Role", ["Owner", "Builder", "Architect", "Broker", "Supplier", "Regulatory", "Other"]),
        dat("Due_Date"),
        sel("Status", ["Pending", "Sent", "Acknowledged", "Overdue"]),
        text("Sent_By"),
        long("Notes"),
      ],
    }),
  });
  if (!res.ok) throw new Error(`create COMMS: HTTP ${res.status}: ${await res.text()}`);
  comms = await res.json();
  console.log("  + COMMS table");
  await refresh();
  comms = byName("COMMS");
}
// COMMS link fields (added after creation so the linked tables resolve).
await addField(comms, link("Job", jobs.id), "COMMS");
await refresh(); comms = byName("COMMS");
if (contacts) { await addField(comms, link("Stakeholder", contacts.id), "COMMS"); await refresh(); comms = byName("COMMS"); }
if (phases) { await addField(comms, link("Phase", phases.id), "COMMS"); await refresh(); comms = byName("COMMS"); }
if (issuesTbl) { await addField(comms, link("Linked_Issue", issuesTbl.id), "COMMS"); await refresh(); comms = byName("COMMS"); }
if (decisions) { await addField(comms, link("Linked_Decision", decisions.id), "COMMS"); await refresh(); comms = byName("COMMS"); }

// ── 2. PHASES engagement fields ──────────────────────────────────────────────
console.log(`\n[${baseId}] PHASES engagement fields`);
if (!phases) {
  console.warn("  ! PHASES table absent — skipping");
} else {
  await addField(phases, sel("Phase_Type", ["Linear", "Cyclical", "Parallel"]));
  await addField(phases, check("Loop_Permitted"));
  await addField(phases, sel("RAG", ["Red", "Amber", "Green"]));
  await addField(phases, numf("Sequence"));
  await addField(phases, text("Season_Year"));
  await refresh();
  const ph = byName("PHASES");
  await addField(ph, link("Predecessor_Phase", ph.id), "Successor_Phases");
}

// ── 3. ISSUES / ACTION_HUB fields ────────────────────────────────────────────
console.log(`\n[${baseId}] ISSUES (${issuesTbl?.name}) fields`);
if (!issuesTbl) {
  console.warn("  ! ISSUES/ACTION_HUB table absent — skipping");
} else {
  await addField(issuesTbl, sel("Issue_Type", ["Open Action", "Blocker", "Risk Materialised", "Decision Required", "Scope Change Trigger"]));
  await refresh();
  let it = byName(issuesTbl.name);
  if (phases) { await addField(it, link("Phase", byName("PHASES").id), "ISSUES"); await refresh(); it = byName(issuesTbl.name); }
  if (risks) { await addField(it, link("Linked_Risk", byName("RISKS").id), "Linked_Issues"); }
}

console.log(`\n✓ ${baseId}: Spec 10 Phase-0 additive schema applied.`);
