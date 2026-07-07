import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook } from "./webhookAuth";

const SECRET = "s3cr3t-signing-key";
const NOW = 1_800_000_000; // fixed clock for determinism
const BODY = JSON.stringify({ orgSlug: "acme", channel: "email", externalId: "abc-1" });

function verify(overrides: Partial<Parameters<typeof verifyWebhook>[0]> = {}) {
  const ts = String(NOW);
  return verifyWebhook({
    secret: SECRET,
    rawBody: BODY,
    timestampHeader: ts,
    signatureHeader: signWebhook(SECRET, ts, BODY),
    nowSeconds: NOW,
    ...overrides,
  });
}

describe("verifyWebhook", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verify()).toEqual({ ok: true });
  });

  it("accepts a `sha256=` prefixed signature header", () => {
    const ts = String(NOW);
    const r = verify({ signatureHeader: `sha256=${signWebhook(SECRET, ts, BODY)}` });
    expect(r.ok).toBe(true);
  });

  it("rejects a tampered body (signature no longer matches)", () => {
    const r = verify({ rawBody: BODY + " " });
    expect(r).toEqual({ ok: false, status: 401, error: "Invalid signature" });
  });

  it("rejects a signature made with the wrong secret", () => {
    const ts = String(NOW);
    const r = verify({ signatureHeader: signWebhook("other-secret", ts, BODY) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("rejects a stale timestamp beyond the skew window", () => {
    const staleTs = String(NOW - 400); // > 300s skew
    const r = verifyWebhook({
      secret: SECRET,
      rawBody: BODY,
      timestampHeader: staleTs,
      signatureHeader: signWebhook(SECRET, staleTs, BODY),
      nowSeconds: NOW,
    });
    expect(r).toEqual({ ok: false, status: 401, error: "Missing or stale timestamp" });
  });

  it("rejects a missing timestamp header", () => {
    const r = verify({ timestampHeader: null });
    expect(r).toEqual({ ok: false, status: 401, error: "Missing or stale timestamp" });
  });

  it("returns 503 when no secret is configured", () => {
    const r = verify({ secret: "" });
    expect(r).toEqual({ ok: false, status: 503, error: "Webhook ingestion not configured for org" });
  });
});
