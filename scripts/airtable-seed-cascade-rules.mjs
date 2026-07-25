// Seed the seven Spec 12 Module 5 cascade rules as LEARNING_RULES records on
// LIVE customer bases (docs/spec12-lock-plan.md §5.1, lock decision D-4).
// Mirrors src/lib/platform/cascade.ts CASCADE_RULE_SEEDS through the
// learning_rule field-map shape, so rows read back identically to
// onboarding/UI-seeded ones:
//   · advisory rules (A/B/C/E) seed Active ("Published") — informational only
//   · write-effect rules (D/F/G) seed as Drafts the owner activates in the
//     learning UI before any auto-write happens
// Governance stamp: Override_Level=Owner_Only, Application_Window=[].
//
// Idempotent on the Instance code — existing CASCADE-x rows are never touched.
// Deliberately NOT run against template bases: onboarding seeds these per org
// (rows in a template would double-seed every future clone).
//
//   node scripts/airtable-seed-cascade-rules.mjs [baseId ...]

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

const DEFAULT_BASES = [
  "appmDPKjRT4Kp9rvN", // Dulong Downs Didi (customer #1)
  "appr9sReyIHgS6FXy", // Meridian Legal Group (legal demo)
];
const bases = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_BASES;

// Kept in lockstep with CASCADE_RULE_SEEDS (src/lib/platform/cascade.ts).
const SEEDS = [
  { code: "CASCADE-A", active: true,  message: "Phase status changed — review BUDGET, PLAN, ISSUES and PROCUREMENT for downstream impact." },
  { code: "CASCADE-B", active: true,  message: "Vendor record changed — review linked PLAN tasks, ISSUES, PROCUREMENT orders and CASHFLOWS for affected records." },
  { code: "CASCADE-C", active: true,  message: "Budget line changed — reconcile CASHFLOWS period forecasts." },
  { code: "CASCADE-D", active: false, message: "Procurement moved to Invoiced/Paid — create or update the corresponding outgoing CASHFLOWS entry." },
  { code: "CASCADE-E", active: true,  message: "Procurement expected date changed — review the linked PLAN task; a predecessor dependency may shift." },
  { code: "CASCADE-F", active: false, message: "Blocker issue raised — escalate the linked phase's RAG to Amber minimum." },
  { code: "CASCADE-G", active: false, message: "Risk materialised — create the linked ISSUES record automatically." },
];
const kindOf = (active) => (active ? "advisory" : "write");

async function api(path, init) {
  const res = await fetch(`https://api.airtable.com/v0/${path}`, { headers: auth, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

async function listAll(baseId, table) {
  const rows = [];
  let offset;
  do {
    const qs = new URLSearchParams({ pageSize: "100", ...(offset ? { offset } : {}) });
    const page = await api(`${baseId}/${encodeURIComponent(table)}?${qs}`);
    rows.push(...page.records);
    offset = page.offset;
    if (offset) await sleep();
  } while (offset);
  return rows;
}

const today = new Date().toISOString().slice(0, 10);

for (const baseId of bases) {
  console.log(`\n## ${baseId}`);
  let existing;
  try {
    existing = new Set(
      (await listAll(baseId, "LEARNING_RULES")).map((r) => r.fields["Instance"]).filter(Boolean),
    );
  } catch (e) {
    console.error(`  cannot read LEARNING_RULES: ${e.message}`);
    continue;
  }
  for (const seed of SEEDS) {
    if (existing.has(seed.code)) {
      console.log(`  ${seed.code}: already present`);
      continue;
    }
    const description = `[Cascade ${kindOf(seed.active)}] ${seed.message}`;
    try {
      await sleep();
      await api(`${baseId}/LEARNING_RULES`, {
        method: "POST",
        body: JSON.stringify({
          typecast: true,
          fields: {
            Instance: seed.code,
            Rule_Name: description.slice(0, 120),
            Rule_Description: description,
            Rule_Type: "guidance",
            Rule_Status: seed.active ? "Published" : "Draft",
            Applies_To: "Owner Review",
            Trigger_Context: JSON.stringify({ cascade: seed.code }),
            Confidence_Level: 80,
            Override_Permission: true,
            Date_Issued: today,
            Override_Level: "Owner_Only",
            Application_Window: "[]",
          },
        }),
      });
      console.log(`  ${seed.code}: SEEDED (${seed.active ? "Published — advisory" : "Draft — owner activates"})`);
    } catch (e) {
      console.error(`  ${seed.code}: FAILED — ${e.message}`);
    }
  }
}
console.log("\nDone.");
