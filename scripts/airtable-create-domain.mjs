// Create the Residential Project Delivery Domain Extension tables in an Airtable
// base (the spec's documented gap — the template lacks this extension).
//
//   node scripts/airtable-create-domain.mjs [baseId]
//
// Idempotent: existing tables (by name) are skipped, so it is safe to re-run.
// Defaults to the demo base. Job-scoped tables get a "Job" linked field to the
// existing Core JOBS table. Intra-domain links (budget->phase, procurement->
// vendor, quoteline->quote) are deliberately omitted for now.

import { readFileSync } from "node:fs";

const baseId = process.argv[2] ?? "appharWaojouHgMeW";
const JOBS_TABLE_ID = "tblgI7d8qQXY9EqJu";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}
const auth = { Authorization: `Bearer ${loadPat()}`, "Content-Type": "application/json" };

// ── field builders ──────────────────────────────────────────────────────
const text = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const numf = (name, precision = 0) => ({ name, type: "number", options: { precision } });
const money = (name) => ({ name, type: "currency", options: { precision: 2, symbol: "$" } });
const check = (name) => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });
const date = (name) => ({ name, type: "date", options: { dateFormat: { name: "iso" } } });
const select = (name, choices) => ({ name, type: "singleSelect", options: { choices: choices.map((c) => ({ name: c })) } });
const job = () => ({ name: "Job", type: "multipleRecordLinks", options: { linkedTableId: JOBS_TABLE_ID } });

// ── Domain Extension table definitions (first field = primary) ───────────
const TABLES = {
  RISKS: [text("Risk"), numf("Likelihood"), numf("Impact"), long("Mitigation"),
    select("Status", ["open", "accepted", "mitigated", "closed"]), text("Owner"),
    date("Escalated_At"), long("Escalation_Note"), check("Created_By_AI"), job()],
  VENDORS: [text("Vendor_Name"), text("Category"), text("Contact_Name"), text("Contact_Email"),
    text("Contact_Phone"), numf("Rating"), long("Notes"), check("Is_Active")],
  BUDGET: [text("Budget_Line"), text("Category"), long("Description"), money("Budget_Amount"),
    money("Committed_Amount"), money("Actual_Amount"), job()],
  CASHFLOW: [text("Period"), money("Projected"), money("Actual"), long("Notes"), job()],
  PROCUREMENT: [text("Item"), text("Category"), text("Vendor_Name"), numf("Qty", 2),
    money("Unit_Price"), money("Total"), select("Status", ["pending", "ordered", "received", "cancelled"]),
    date("Due_Date"), job()],
  PHASES: [text("Phase_Name"), select("Status", ["pending", "active", "complete", "blocked"]),
    numf("Completion_Pct"), numf("Sort_Order"), date("Start_Date"), date("End_Date"),
    check("Is_AI_Draft"), text("Approved_By"), job()],
  VARIATIONS: [text("Title"), text("Ref_Number"), long("Description"), long("Scope_Change"),
    money("Cost_Impact"), numf("Time_Impact_Days"), select("Status", ["draft", "submitted", "approved", "rejected"]),
    text("Submitted_By"), text("Approved_By"), date("Approved_At"), job()],
  QUOTES: [text("Title"), text("Ref_Number"), text("Client_Name"),
    select("Status", ["draft", "sent", "accepted", "rejected", "expired"]), numf("GST_Rate", 2),
    money("Subtotal"), money("GST_Amount"), money("Total"), long("Notes"), date("Valid_Until"), job()],
  ROOM_MATRIX: [text("Room_Name"), text("Zone"), numf("Area_Sqm", 2), text("Ceiling_Height"), long("Notes"), job()],
  MEETING_MINUTES: [text("Title"), date("Meeting_Date"), text("Attendees"), long("Raw_Minutes"),
    numf("Actions_Count"), select("Status", ["raw", "confirmed"]), job()],
  WEEKLY_REPORTS: [text("Title"), date("Week_Ending"), long("Content"), check("Is_AI_Generated"),
    select("Status", ["draft", "approved", "sent"]), text("Approved_By"), job()],
};

// ── run ───────────────────────────────────────────────────────────────────
const listRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const existing = new Set((await listRes.json()).tables.map((t) => t.name));

for (const [name, fields] of Object.entries(TABLES)) {
  if (existing.has(name)) {
    console.log(`skip   ${name} (exists)`);
    continue;
  }
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ name, fields }),
  });
  if (res.ok) {
    const t = await res.json();
    console.log(`create ${name} -> ${t.id}`);
  } else {
    console.error(`FAIL   ${name} -> HTTP ${res.status}: ${await res.text()}`);
  }
  await new Promise((r) => setTimeout(r, 250)); // respect rate limit
}
console.log("done.");
