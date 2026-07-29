// Set (or generate) an org's inbound-webhook signing secret in the CONTROL base.
// Mirrors setOrgWebhookSecret() in src/lib/airtable/control.ts: merges
// `webhookSecret` into the org registry row's Settings JSON, leaving the rest
// of the config intact.
//
//   node scripts/airtable-set-webhook-secret.mjs <orgSlug> [secret]
//   node scripts/airtable-set-webhook-secret.mjs <orgSlug> --show
//
// With no secret argument a cryptographically random one is generated and
// printed — paste that into n8n as the org's variable. Pass --show to read the
// current secret without changing it.
//
// Base id comes from AIRTABLE_CONTROL_BASE_ID (.env) unless --base=<id> is given.

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

function env(key) {
  if (process.env[key]) return process.env[key];
  try {
    const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    return line ? line.slice(key.length + 1).trim() : "";
  } catch {
    return "";
  }
}

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));

const orgSlug = positional[0];
if (!orgSlug) {
  console.error("Usage: node scripts/airtable-set-webhook-secret.mjs <orgSlug> [secret] [--show]");
  process.exit(1);
}
const showOnly = flags.includes("--show");
const baseFlag = flags.find((f) => f.startsWith("--base="));

const pat = env("AIRTABLE_PAT");
if (!pat) throw new Error("AIRTABLE_PAT not found");
const baseId = baseFlag ? baseFlag.slice("--base=".length) : env("AIRTABLE_CONTROL_BASE_ID");
if (!baseId) throw new Error("No control base id (pass --base=<id> or set AIRTABLE_CONTROL_BASE_ID)");

const auth = { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" };
const REGISTRY = "PLAT_ORG_REGISTRY";
const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(REGISTRY)}`;

// Airtable formula string escaping — same intent as formulaSafe() in control.ts.
const formulaSafe = (s) => String(s).replace(/'/g, "\\'");

const listRes = await fetch(`${url}?filterByFormula=${encodeURIComponent(`{Slug}='${formulaSafe(orgSlug)}'`)}&maxRecords=1`, {
  headers: auth,
});
if (!listRes.ok) throw new Error(`list ${REGISTRY}: HTTP ${listRes.status}: ${await listRes.text()}`);
const records = (await listRes.json()).records ?? [];
if (!records.length) throw new Error(`No ${REGISTRY} row with Slug='${orgSlug}' in base ${baseId}`);

const record = records[0];
let settings = {};
try {
  const parsed = JSON.parse(record.fields["Settings"] || "{}");
  if (parsed && typeof parsed === "object") settings = parsed;
} catch {
  console.warn("! Settings JSON was malformed — starting from empty rather than clobbering silently.");
}

// Note: no process.exit() here — on Windows, exiting while a fetch handle is
// still closing trips a libuv assertion. Let the event loop drain naturally.
if (showOnly) {
  const current = typeof settings.webhookSecret === "string" ? settings.webhookSecret : "";
  console.log(current ? `${orgSlug}: ${current}` : `${orgSlug}: (no webhookSecret set)`);
} else {
  const secret = positional[1] || randomBytes(32).toString("hex");
  settings.webhookSecret = secret;

  const patchRes = await fetch(url, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ records: [{ id: record.id, fields: { Settings: JSON.stringify(settings) } }] }),
  });
  if (!patchRes.ok) throw new Error(`update ${REGISTRY}: HTTP ${patchRes.status}: ${await patchRes.text()}`);

  console.log(`✓ ${orgSlug}: webhookSecret set in ${baseId}/${REGISTRY}`);
  console.log(`\n  ${secret}\n`);
  console.log("Paste that into n8n as the org's variable (Overview → Variables).");
  console.log("The app caches the registry row briefly — allow ~60s, or redeploy, before testing.");
}
