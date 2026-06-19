// Unit tests for the secret-encryption primitive. No DB — pure crypto.

import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./crypto";

describe("secret encryption (AES-256-GCM)", () => {
  it("round-trips plaintext", () => {
    const secret = "xoxb-super-secret-oauth-token-12345";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("round-trips unicode, empty, and large values", () => {
    for (const s of ["", "naïve café — 你好 🔐", "x".repeat(4000)]) {
      expect(decryptSecret(encryptSecret(s))).toBe(s);
    }
  });

  it("uses a fresh IV each call, so ciphertexts differ but decrypt equal", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("never embeds the plaintext in the ciphertext", () => {
    const enc = encryptSecret("PLAINTEXT_NEEDLE");
    expect(enc).not.toContain("PLAINTEXT_NEEDLE");
    expect(enc.startsWith("v1:")).toBe(true);
  });

  it("rejects a tampered ciphertext via the auth tag", () => {
    const parts = encryptSecret("tamper-me").split(":");
    const ct = Buffer.from(parts[3], "base64");
    ct[0] ^= 0xff; // flip a byte
    parts[3] = ct.toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects unknown formats and versions", () => {
    expect(() => decryptSecret("nonsense")).toThrow();
    expect(() => decryptSecret("v2:a:b:c")).toThrow();
  });

  it("reports configuration state as a boolean", () => {
    expect(typeof isEncryptionConfigured()).toBe("boolean");
  });
});
