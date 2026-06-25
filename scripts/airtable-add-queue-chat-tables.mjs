// Add the platform queue + assistant-chat tables (PENDING_WRITES, CHAT_SESSIONS,
// CHAT_MESSAGES) to a base. These exist in schema.generated.ts (the app reads +
// writes them) but were never created in the Master Template, so cloned client
// bases lacked them and the dashboard 403'd on GET PENDING_WRITES.
//
// Idempotent: creates a table if absent, otherwise adds only its missing fields.
// Field types mirror schema.generated.ts so the codecs line up.
//
// Usage:
//   node scripts/airtable-add-queue-chat-tables.mjs [baseId]
//   (defaults to AIRTABLE_TEMPLATE_BASE_ID, else the demo base)

import { readFileSync } from "node:fs";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}
function envVar(key, fallback) {
  if (process.env[key]) return process.env[key];
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : fallback;
  } catch {
    return fallback;
  }
}

const token = loadPat();
const baseId = process.argv[2] ?? envVar("AIRTABLE_TEMPLATE_BASE_ID", "appharWaojouHgMeW");
const META = "https://api.airtable.com/v0/meta";
const sleep = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const DATETIME = { dateFormat: { name: "iso" }, timeZone: "utc", timeFormat: { name: "24hour" } };
const sel = (...choices) => ({ choices: choices.map((name) => ({ name })) });

// Field specs mirror schema.generated.ts. First field is the (text) primary.
const TABLES = [
  {
    name: "PENDING_WRITES",
    fields: [
      { name: "Table_Key", type: "singleLineText" },
      { name: "Op", type: "singleSelect", options: sel("create", "update") },
      { name: "Record_Id", type: "singleLineText" },
      { name: "Payload", type: "multilineText" },
      { name: "Actor_Type", type: "singleLineText" },
      { name: "Actor_Name", type: "singleLineText" },
      { name: "Status", type: "singleSelect", options: sel("proposed", "executed", "rejected", "expired", "failed") },
      { name: "Created_At", type: "dateTime", options: DATETIME },
      { name: "Expires_At", type: "dateTime", options: DATETIME },
      { name: "Job_Id", type: "singleLineText" },
      { name: "Resolved_By", type: "singleLineText" },
      { name: "Resolved_At", type: "dateTime", options: DATETIME },
      { name: "Error", type: "multilineText" },
    ],
  },
  {
    name: "CHAT_SESSIONS",
    fields: [
      { name: "Session_Title", type: "singleLineText" },
      { name: "Job_Id", type: "singleLineText" },
      { name: "Started_At", type: "dateTime", options: DATETIME },
      { name: "Ended_At", type: "dateTime", options: DATETIME },
      { name: "Summary", type: "multilineText" },
    ],
  },
  {
    name: "CHAT_MESSAGES",
    fields: [
      { name: "Session_Id", type: "singleLineText" },
      { name: "Role", type: "singleLineText" },
      { name: "Content", type: "multilineText" },
      { name: "Tool_Calls", type: "multilineText" },
      { name: "Created_At", type: "dateTime", options: DATETIME },
    ],
  },
];

async function meta(path, init) {
  const res = await fetch(`${META}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}

const existing = (await meta(`bases/${baseId}/tables`)).tables;
const byName = new Map(existing.map((t) => [t.name, t]));
console.log(`base ${baseId}: ${existing.length} tables`);

for (const spec of TABLES) {
  const found = byName.get(spec.name);
  if (!found) {
    await sleep();
    const created = await meta(`bases/${baseId}/tables`, {
      method: "POST",
      body: JSON.stringify({ name: spec.name, fields: spec.fields }),
    });
    console.log(`  + created table ${spec.name} (${spec.fields.length} fields) -> ${created.id}`);
    continue;
  }
  const have = new Set(found.fields.map((f) => f.name));
  const missing = spec.fields.filter((f) => !have.has(f.name));
  if (!missing.length) {
    console.log(`  = ${spec.name} present, all fields exist`);
    continue;
  }
  for (const f of missing) {
    await sleep();
    await meta(`bases/${baseId}/tables/${found.id}/fields`, { method: "POST", body: JSON.stringify(f) });
    console.log(`  + ${spec.name}.${f.name}`);
  }
}
console.log("done.");
