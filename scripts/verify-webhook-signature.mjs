// Diagnose a webhook "Invalid signature" 401 by recomputing the HMAC locally.
//
// Copy the three values out of the n8n execution (open the run → the
// "Sign (HMAC-SHA256)" node → OUTPUT tab) into a JSON file, then:
//
//   AEQ_WEBHOOK_SECRET=<org secret> node scripts/verify-webhook-signature.mjs sample.json
//
// sample.json: { "rawBody": "...", "ts": "...", "signature": "..." }
// (signature may include or omit the "sha256=" prefix)
//
// It splits the two possible failure modes apart:
//   · signature mismatch  → the SECRET in n8n differs from the org's secret
//   · signature match     → the secret is right; the BODY was altered in
//                           transit (the classic re-serialization gotcha)

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const secret = process.env.AEQ_WEBHOOK_SECRET;
if (!secret) {
  console.error("Set AEQ_WEBHOOK_SECRET to the org's secret (airtable-set-webhook-secret.mjs --show).");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: AEQ_WEBHOOK_SECRET=... node scripts/verify-webhook-signature.mjs <sample.json>");
  process.exit(1);
}

const sample = JSON.parse(readFileSync(file, "utf8"));
const rawBody = String(sample.rawBody ?? "");
const ts = String(sample.ts ?? "");
const provided = String(sample.signature ?? "").replace(/^sha256=/i, "").trim();

const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");

console.log("timestamp :", JSON.stringify(ts));
console.log("rawBody   :", rawBody.length, "bytes");
console.log("expected  :", expected);
console.log("from n8n  :", provided || "(none supplied)");
console.log();

if (!provided) {
  console.log("No signature supplied — nothing to compare.");
} else if (provided === expected) {
  console.log("MATCH. The secret in n8n is correct and it signed these exact bytes.");
  console.log("So the 401 means the BODY CHANGED between signing and sending —");
  console.log("check the HTTP node is Body Content Type = RAW (not JSON) and that");
  console.log("its body field is exactly {{ $json.rawBody }} with nothing appended.");
} else {
  console.log("MISMATCH. n8n signed with a DIFFERENT SECRET than the org's.");
  console.log("Re-copy the secret into the Crypto node's Secret field — watch for a");
  console.log("trailing space/newline, or the PASTE_..._HERE placeholder still in place.");
}

// Whitespace is invisible in the n8n UI and a common cause — flag it explicitly.
const trimmed = rawBody.trim();
if (trimmed !== rawBody) {
  console.log("\n! rawBody has leading/trailing whitespace — that alone breaks the HMAC.");
}
try {
  const reserialized = JSON.stringify(JSON.parse(rawBody));
  if (reserialized !== rawBody) {
    console.log("\n! rawBody is not canonical JSON.stringify output — something reformatted it");
    console.log("  (key order or spacing changed). Send the ORIGINAL string, not a re-encode.");
  }
} catch {
  console.log("\n! rawBody is not parseable JSON — it was mangled before sending.");
}
