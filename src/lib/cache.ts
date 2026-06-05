// Small in-memory cache for paid external API calls — port of paid_api_cache.py.
// Django used its configured cache backend; here a module-level Map with TTLs
// is sufficient for dedup within the quoting workflow (per server process).

import { createHash } from "node:crypto";

export const CACHE_VERSION = "paid-api-v1";
export const SHORT_TTL_SECONDS = 15 * 60;
export const MEDIUM_TTL_SECONDS = 6 * 60 * 60;
export const LONG_TTL_SECONDS = 24 * 60 * 60;
export const NEGATIVE_TTL_SECONDS = 60 * 60;

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export function roundedPoint(lat: number, lng: number, precision = 5): { lat: number; lng: number } {
  const f = 10 ** precision;
  return { lat: Math.round(Number(lat) * f) / f, lng: Math.round(Number(lng) * f) / f };
}

export function normalizedAddress(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(" ")
    .slice(0, 220);
}

// Stable JSON with sorted keys (mirrors json.dumps(sort_keys=True, separators=(",",":"))).
function stableStringify(payload: unknown): string {
  return JSON.stringify(payload, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}

export function makeCacheKey(namespace: string, payload: unknown): string {
  const raw = stableStringify(payload);
  const digest = createHash("sha256").update(raw, "utf8").digest("hex");
  return `${CACHE_VERSION}:${namespace}:${digest}`;
}

export function getCached<T = unknown>(namespace: string, payload: unknown): T | null {
  const entry = store.get(makeCacheKey(namespace, payload));
  if (!entry) return null;
  if (entry.expiresAt < performance.now()) {
    store.delete(makeCacheKey(namespace, payload));
    return null;
  }
  return entry.value as T;
}

export function setCached(namespace: string, payload: unknown, value: unknown, ttlSeconds: number): void {
  store.set(makeCacheKey(namespace, payload), {
    value,
    expiresAt: performance.now() + ttlSeconds * 1000,
  });
}

export function cloneJsonable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
