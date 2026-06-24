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

async function listTables() {
  const res = await fetch(`${meta}/tables`, { headers: auth });
  if (!res.ok) throw new Error(`list tables: HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).tables;
}

async function createTableIfMissing(name, fields) {
  const tables = await listTables();
  if (tables.some((t) => t.name === name)) {
    console.log(`✓ ${baseId}: ${name} table already exists.`);
    return;
  }
  const res = await fetch(`${meta}/tables`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ name, fields }),
  });
  if (!res.ok) throw new Error(`create ${name}: HTTP ${res.status}: ${await res.text()}`);
  console.log(`✓ ${baseId}: created ${name} table`);
}

await createTableIfMissing("CHAT_SESSIONS", [
  text("Session_Title"),
  text("Job_Id"),
  dateTime("Started_At"),
  dateTime("Ended_At"),
  long("Summary"),
]);

await createTableIfMissing("CHAT_MESSAGES", [
  text("Session_Id"),
  text("Role"),
  long("Content"),
  long("Tool_Calls"),
  dateTime("Created_At"),
]);
