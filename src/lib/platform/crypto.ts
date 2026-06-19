// AES-256-GCM encryption for secrets at rest — per-org OAuth tokens, API keys,
// anything we must store but never expose in plaintext. GCM gives us both
// confidentiality and integrity: a tampered ciphertext fails the auth-tag check
// and decryption throws rather than returning garbage.
//
// The key derives from PLATFORM_ENCRYPTION_KEY. In dev/test a fixed,
// deliberately-insecure fallback keeps the feature exercisable without secrets;
// isEncryptionConfigured() lets callers (and an ops check) detect prod misconfig.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const DEV_FALLBACK = "aequilibri-dev-insecure-key-do-not-use-in-prod";

/** True when a real encryption key is configured (not the dev fallback). */
export function isEncryptionConfigured(): boolean {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY;
  return !!raw && raw.length >= 16;
}

// Derive a 32-byte key from the configured secret (or the dev fallback) via
// SHA-256, so any-length env value yields a valid AES-256 key.
function key(): Buffer {
  const raw = isEncryptionConfigured() ? (process.env.PLATFORM_ENCRYPTION_KEY as string) : DEV_FALLBACK;
  return createHash("sha256").update(raw).digest();
}

/** Encrypt UTF-8 plaintext into a compact, self-describing token:
 *  `v1:<iv>:<authTag>:<ciphertext>` (each part base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Decrypt a value produced by encryptSecret. Throws on tamper, wrong key, or
 *  an unrecognised version — callers should treat a throw as "no usable value". */
export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognised secret payload (bad format or version).");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
