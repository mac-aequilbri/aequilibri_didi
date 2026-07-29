// Send a signed test message to the inbound integration webhook
// (/api/platform/hooks) — simulates what an n8n Workflow-A run delivers.
//
//   AEQ_WEBHOOK_SECRET=<org secret> node scripts/send-test-webhook.mjs [orgSlug] [baseUrl]
//
// Defaults: orgSlug=dulong-downs-didi, baseUrl=https://aequilibri-next.onrender.com
// Use a fresh externalId per run to bypass dedup, or reuse one to test dedup.

import crypto from "node:crypto";

const orgSlug = process.argv[2] ?? "dulong-downs-didi";
const baseUrl = process.argv[3] ?? "https://aequilibri-next.onrender.com";
const secret = process.env.AEQ_WEBHOOK_SECRET;
if (!secret) {
  console.error("Set AEQ_WEBHOOK_SECRET to the org's webhook secret (PLAT_ORG_REGISTRY settings.webhookSecret).");
  process.exit(1);
}

const payload = {
  orgSlug,
  channel: "email",
  externalId: process.env.AEQ_EXTERNAL_ID ?? `test-${Date.now()}`,
  from: "test@aequilibri.com",
  subject: "Webhook end-to-end test",
  body: "Hi team, please order 40 sheets of 13mm plasterboard for the Riverside job by Friday.",
  receivedAt: new Date().toISOString(),
};

const rawBody = JSON.stringify(payload);
const ts = Math.floor(Date.now() / 1000).toString();
const sig = crypto.createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");

const res = await fetch(`${baseUrl}/api/platform/hooks`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Aequilibri-Timestamp": ts,
    "X-Aequilibri-Signature": `sha256=${sig}`,
  },
  body: rawBody,
});

console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(await res.json(), null, 2));
