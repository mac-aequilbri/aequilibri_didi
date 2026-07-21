// Smoke test — write one representative record to every table the seed touches
// (using the REAL generators), confirm no field/type errors, then delete them.
// Does not touch state.json. Run before 04-seed.mjs to fail fast.
//
//   node scripts/legal-demo/smoke.mjs

import { createAll, deleteAll, loadState, log } from "./_lib.mjs";
import {
  buildClients, buildMatters, jobFields, phaseRows,
  cashflowRows, budgetRows, riskRows, commsRows, documentRows,
} from "./04-seed.mjs";
import { DECISIONS_POOL } from "./data.mjs";

const { baseId } = loadState();
if (!baseId) throw new Error("No baseId in state.json — run 01-provision.mjs first.");

const created = {}; // table → [ids]
const track = (table, recs) => { created[table] = (created[table] ?? []).concat(recs.map((r) => r.id)); return recs; };

try {
  const clients = buildClients();
  const matters = buildMatters(clients);
  // pick a closed matter and an open one to exercise both branches
  const closed = matters.find((m) => m.isClosed);
  const open = matters.find((m) => !m.isClosed);

  log("CONTACTS…");
  const c = track("CONTACTS", await createAll(baseId, "CONTACTS", [{ Contact_Name: clients[0].name, Email: clients[0].email, Phone: clients[0].phone, Role: clients[0].role, Notes: clients[0].notes }]));

  log("JOBS (closed + open)…");
  const jobs = track("JOBS", await createAll(baseId, "JOBS", [jobFields(closed), jobFields(open)]));
  const [closedId, openId] = jobs.map((j) => j.id);

  log("PHASES…");
  track("PHASES", await createAll(baseId, "PHASES", [...phaseRows(closed, closedId), ...phaseRows(open, openId)]));
  log("CASHFLOWS…");
  track("CASHFLOWS", await createAll(baseId, "CASHFLOWS", cashflowRows(open, openId)));
  log("BUDGET…");
  track("BUDGET", await createAll(baseId, "BUDGET", budgetRows(open, openId)));
  log("RISKS…");
  track("RISKS", await createAll(baseId, "RISKS", riskRows(open, openId)));
  log("COMMS…");
  track("COMMS", await createAll(baseId, "COMMS", commsRows(open, openId)));
  log("DOCUMENTS…");
  track("DOCUMENTS", await createAll(baseId, "DOCUMENTS", documentRows(open, openId)));
  log("DECISIONS…");
  track("DECISIONS", await createAll(baseId, "DECISIONS", [{ Decision_Name: DECISIONS_POOL[0][0], Decision_Description: DECISIONS_POOL[0][2], Decision_Type: DECISIONS_POOL[0][1], Decision_Date: new Date("2026-01-15T00:00:00Z").toISOString(), Status: "Made", Rationale: DECISIONS_POOL[0][2], Notes: "smoke" }]));
  log("PENDING_WRITES…");
  track("PENDING_WRITES", await createAll(baseId, "PENDING_WRITES", [{ Table_Key: "risk", Op: "create", Payload: "{}", Actor_Type: "ai", Actor_Name: "Themis", Status: "proposed", Created_At: new Date().toISOString(), Job_Id: openId }]));

  log("\n✓ ALL TABLES OK — field names valid. Cleaning up…");
} catch (e) {
  console.error("\n✗ SMOKE FAILED:", e.message);
} finally {
  for (const [table, ids] of Object.entries(created)) {
    if (ids.length) { await deleteAll(baseId, table, ids); log(`  deleted ${ids.length} from ${table}`); }
  }
  log("cleanup done.");
}
