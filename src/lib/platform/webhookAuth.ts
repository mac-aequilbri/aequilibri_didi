// HMAC authentication for the inbound integration webhook (/api/platform/hooks).
// Kept as a pure, dependency-free module so the signing scheme is unit-testable
// in isolation from the Next.js route handler.
//
// Scheme: HMAC-SHA256 over `${timestamp}.${rawBody}` with the org's signing
// secret. The signer sends the same timestamp string it hashed, so replays are
// bounded by a clock-skew window (and duplicate deliveries are additionally
// caught by externalId dedup downstream).

import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_MAX_SKEW_SECONDS = 300;

export type WebhookAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

/** Compute the hex signature for a payload — used by the verifier and by test
 *  clients / signing scripts. `timestamp` must match the header byte-for-byte. */
export function signWebhook(secret: string, timestamp: string | number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Constant-time hex compare; false (never throws) on length mismatch. */
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyWebhook(args: {
  secret: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  /** Injectable for tests; defaults to the real clock. */
  nowSeconds?: number;
  maxSkewSeconds?: number;
}): WebhookAuthResult {
  if (!args.secret) {
    return { ok: false, status: 503, error: "Webhook ingestion not configured for org" };
  }
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxSkew = args.maxSkewSeconds ?? WEBHOOK_MAX_SKEW_SECONDS;

  const ts = Number(args.timestampHeader ?? "");
  if (!Number.isFinite(ts) || !args.timestampHeader || Math.abs(now - ts) > maxSkew) {
    return { ok: false, status: 401, error: "Missing or stale timestamp" };
  }

  const provided = (args.signatureHeader ?? "").replace(/^sha256=/i, "");
  const expected = signWebhook(args.secret, args.timestampHeader, args.rawBody);
  if (!safeEqualHex(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }
  return { ok: true };
}
