// Disaster-recovery export: dump every table of one or more Airtable bases to
// timestamped JSON files. Airtable is the system of record and its own trash/
// snapshot retention is limited — run this on a schedule (cron/n8n/GitHub
// Actions) and ship the output directory to durable off-Airtable storage.
//
//   node scripts/airtable-export-backup.mjs <baseId> [<baseId> ...]
//   node scripts/airtable-export-backup.mjs --out ./backups appXXXX appYYYY
//
// Read-only (GET only). Paces requests ~250ms apart to respect the
// 5 req/s/base limit. Output: <out>/<timestamp>/<baseId>/<table>.json plus a
// schema.json per base (table + field definitions, needed for a restore).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function loadPat() {
  if (process.env.AIRTABLE_PAT) return process.env.AIRTABLE_PAT;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("AIRTABLE_PAT="));
  if (!line) throw new Error("AIRTABLE_PAT not found");
  return line.slice("AIRTABLE_PAT=".length).trim();
}

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outRoot = outFlag >= 0 ? args[outFlag + 1] : "outputs/airtable-backups";
const baseIds = args.filter((a, i) => a.startsWith("app") && (outFlag < 0 || (i !== outFlag && i !== outFlag + 1)));
if (baseIds.length === 0) {
  console.error("Usage: node scripts/airtable-export-backup.mjs [--out <dir>] <baseId> [...]");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${loadPat()}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(url) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: auth });
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`GET ${url}: still failing after 5 attempts`);
}

async function exportBase(baseId, dir) {
  mkdirSync(dir, { recursive: true });
  const schema = await apiGet(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`);
  writeFileSync(join(dir, "schema.json"), JSON.stringify(schema, null, 2));

  let totalRecords = 0;
  for (const table of schema.tables) {
    const records = [];
    let offset;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (offset) params.set("offset", offset);
      const page = await apiGet(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table.name)}?${params}`,
      );
      records.push(...page.records);
      offset = page.offset;
      await sleep(250);
    } while (offset);
    writeFileSync(join(dir, `${table.name.replace(/[^\w.-]+/g, "_")}.json`), JSON.stringify(records, null, 2));
    totalRecords += records.length;
    console.log(`  ${baseId}/${table.name}: ${records.length} records`);
  }
  return totalRecords;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
for (const baseId of baseIds) {
  console.log(`Exporting ${baseId} …`);
  const n = await exportBase(baseId, join(outRoot, stamp, baseId));
  console.log(`✓ ${baseId}: ${n} records exported to ${join(outRoot, stamp, baseId)}`);
}
