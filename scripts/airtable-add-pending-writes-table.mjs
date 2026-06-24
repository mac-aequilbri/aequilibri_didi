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

const text = (name) => ({ name, type: "singleLineText" });
const long = (name) => ({ name, type: "multilineText" });
const dateTime = (name) => ({ name, type: "dateTime" });

const listRes = await fetch(`${meta}/tables`, { headers: auth });
if (!listRes.ok) throw new Error(`list tables: HTTP ${listRes.status}: ${await listRes.text()}`);
const tables = (await listRes.json()).tables;

const existing = tables.find((t) => t.name === "PENDING_WRITES");
if (existing) {
  console.log(`✓ ${baseId}: PENDING_WRITES table already exists.`);
  process.exit(0);
}

const res = await fetch(`${meta}/tables`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    name: "PENDING_WRITES",
    fields: [
      text("Table_Key"),
      { name: "Op", type: "singleSelect", options: { choices: [{ name: "create" }, { name: "update" }, { name: "delete" }] } },
      text("Record_Id"),
      long("Payload"),
      text("Actor_Type"),
      text("Actor_Name"),
      {
        name: "Status",
        type: "singleSelect",
        options: { choices: [{ name: "proposed" }, { name: "executed" }, { name: "rejected" }, { name: "expired" }, { name: "failed" }] },
      },
      dateTime("Created_At"),
      dateTime("Expires_At"),
      text("Job_Id"),
      text("Resolved_By"),
      dateTime("Resolved_At"),
      long("Error"),
    ],
  }),
});
if (!res.ok) throw new Error(`create PENDING_WRITES: HTTP ${res.status}: ${await res.text()}`);
console.log(`✓ ${baseId}: created PENDING_WRITES table`);
