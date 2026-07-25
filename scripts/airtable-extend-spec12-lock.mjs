// Spec 12 lock build (docs/spec12-lock-plan.md) — provision the seven columns
// the L1–L3 phases hand-patched into schema.generated.ts:
//
//   JOBS.Engagement_Type              singleSelect  (M5 §5.3 — per-job engagement type)
//   JOBS.Scope_Changes_Count          number        (M6 §6.2 — job-close delta)
//   ENGAGEMENT_TYPE_CONFIG.Portfolio_View  checkbox (M8 D-11 — explicit portfolio flag)
//   LEARNING_RULES.Override_Level     singleSelect  (M6 §6.1 — governance ladder)
//   LEARNING_RULES.Application_Window multilineText (M6 §6.1 — rolling last-10 window)
//   CORRECTIONS.Source_Module         singleSelect  (M6 §6.4 — first-class column)
//   CORRECTIONS.Correction_Direction  singleSelect  (M6 §6.4 — first-class column)
//
// Additive + idempotent (existing fields skipped). Runs against the three
// template bases (so migrateBaseToTemplate carries the fields to future
// clones) AND the live customer bases.
//
//   node scripts/airtable-extend-spec12-lock.mjs [baseId ...]

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
  "appIf959oh38fgKYp", // aequilibri Core Template (canonical schema reference)
  "appDSGE0EcAf2pRDZ", // aequilibri Roofing Template
  "appXfwBLE6zBEL5Zr", // aequilibri Construction Template
  "appmDPKjRT4Kp9rvN", // Dulong Downs Didi (customer #1)
  "appr9sReyIHgS6FXy", // Meridian Legal Group (legal demo)
];
const bases = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_BASES;

const choices = (...names) => ({ choices: names.map((name) => ({ name })) });

/** table → fields to ensure. Choice lists match the app's writers/readers. */
const EXTENSIONS = {
  JOBS: [
    {
      name: "Engagement_Type",
      type: "singleSelect",
      options: choices("Short Job", "Long Project", "Ongoing Lifecycle", "Seasonal Cycle", "General"),
    },
    { name: "Scope_Changes_Count", type: "number", options: { precision: 0 } },
  ],
  ENGAGEMENT_TYPE_CONFIG: [
    { name: "Portfolio_View", type: "checkbox", options: { icon: "check", color: "greenBright" } },
  ],
  LEARNING_RULES: [
    { name: "Override_Level", type: "singleSelect", options: choices("Owner_Only", "Standard", "Advisory") },
    { name: "Application_Window", type: "multilineText" },
  ],
  CORRECTIONS: [
    {
      name: "Source_Module",
      type: "singleSelect",
      options: choices("module2", "module3", "module5", "module6", "manual"),
    },
    {
      name: "Correction_Direction",
      type: "singleSelect",
      options: choices("Over_Estimate", "Under_Estimate", "Wrong_Category", "Wrong_Sequence"),
    },
  ],
};

async function meta(path, init) {
  const res = await fetch(`https://api.airtable.com/v0/meta/${path}`, { headers: auth, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`meta ${path}: HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

let added = 0;
let skippedExisting = 0;
for (const baseId of bases) {
  console.log(`\n## ${baseId}`);
  let tables;
  try {
    ({ tables } = await meta(`bases/${baseId}/tables`));
  } catch (e) {
    console.error(`  cannot read schema: ${e.message}`);
    continue;
  }
  for (const [tableName, fields] of Object.entries(EXTENSIONS)) {
    const t = tables.find((x) => x.name === tableName);
    if (!t) {
      console.log(`  ${tableName}: table absent — skipped (app-runtime tables land at onboarding)`);
      continue;
    }
    const have = new Set(t.fields.map((f) => f.name));
    for (const f of fields) {
      if (have.has(f.name)) {
        skippedExisting += 1;
        console.log(`  ${tableName}.${f.name}: already present`);
        continue;
      }
      try {
        await sleep();
        await meta(`bases/${baseId}/tables/${t.id}/fields`, {
          method: "POST",
          body: JSON.stringify(f),
        });
        added += 1;
        console.log(`  ${tableName}.${f.name}: ADDED (${f.type})`);
      } catch (e) {
        console.error(`  ${tableName}.${f.name}: FAILED — ${e.message}`);
      }
    }
  }
}
console.log(`\nDone. ${added} fields added, ${skippedExisting} already present.`);
