// Stage 2 — reconcile the cloned base to the app's read/write schema.
//
// The reachable templates use the leaner "Spec 12" field set, but the app's
// field maps + read sources (schema.generated / fieldMaps.ts) were written
// against the demo base and read a few field NAMES the lean template lacks
// (e.g. PHASES.Completion_Pct, RISKS.Risk/Likelihood/Impact-as-number). The app
// degrades gracefully on the misses (blank/0), but for a polished demo we add
// the high-value fields by name so progress bars, ordering, and the risk
// register render fully. Additive + idempotent (skips fields already present);
// two colliding RISKS fields (Impact select, Owner link) are renamed aside so
// the app-canonical numeric/text versions can be added.

import { readBaseSchema, metaPost, metaPatch, sleep, loadState, log } from "./_lib.mjs";

const num0 = { type: "number", options: { precision: 0 } };
const check = { type: "checkbox", options: { icon: "check", color: "greenBright" } };
const text = { type: "singleLineText" };
const longtext = { type: "multilineText" };
const date = { type: "date", options: { dateFormat: { name: "iso" } } };

// table → [{ name, ...spec }] fields to ensure exist (added if missing).
const ADD = {
  PHASES: [
    { name: "Completion_Pct", ...num0 },
    { name: "Sort_Order", ...num0 },
    { name: "Is_AI_Draft", ...check },
    { name: "Approved_By", ...text },
  ],
  RISKS: [
    { name: "Risk", ...text },
    { name: "Likelihood", ...num0 },
    { name: "Impact", ...num0 },
    { name: "Owner", ...text },
    { name: "Escalated_At", ...date },
    { name: "Escalation_Note", ...longtext },
    { name: "Created_By_AI", ...check },
  ],
};

// RISKS fields whose NAME the app wants for a different type — rename aside so
// the app-canonical field can be added. [currentName, type-if-matches, newName].
const RENAME = {
  RISKS: [
    { name: "Impact", ifType: "singleSelect", to: "Impact_Level" },
    { name: "Owner", ifType: "multipleRecordLinks", to: "Owner_Contact" },
  ],
};

async function main() {
  const { baseId } = loadState();
  if (!baseId) throw new Error("No baseId in state.json — run 01-provision.mjs first.");
  const tables = await readBaseSchema(baseId);
  const byName = new Map(tables.map((t) => [t.name, t]));

  // Pass 1 — renames (so a colliding name is free before we add the app version).
  for (const [tbl, rules] of Object.entries(RENAME)) {
    const t = byName.get(tbl);
    if (!t) continue;
    for (const rule of rules) {
      const f = t.fields.find((x) => x.name === rule.name);
      if (f && f.type === rule.ifType) {
        await sleep(150);
        await metaPatch(`bases/${baseId}/tables/${t.id}/fields/${f.id}`, { name: rule.to });
        f.name = rule.to; // reflect locally so the add-pass sees the name freed
        log(`  ~ ${tbl}.${rule.name} → ${rule.to}`);
      }
    }
  }

  // Pass 2 — add missing fields.
  for (const [tbl, fields] of Object.entries(ADD)) {
    const t = byName.get(tbl);
    if (!t) { log(`  ! table ${tbl} absent — skipped`); continue; }
    const have = new Set(t.fields.map((f) => f.name));
    for (const spec of fields) {
      if (have.has(spec.name)) { log(`  = ${tbl}.${spec.name} exists`); continue; }
      await sleep(150);
      await metaPost(`bases/${baseId}/tables/${t.id}/fields`, spec);
      log(`  + ${tbl}.${spec.name} (${spec.type})`);
    }
  }
  log("\nSchema reconciled.");
}

main().catch((e) => { console.error("\nRECONCILE FAILED:", e.message); process.exit(1); });
