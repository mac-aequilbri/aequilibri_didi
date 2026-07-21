// Shared helpers for the law-firm ("legal" vertical) demo seed.
//
// A self-contained toolkit for the legal-demo stage scripts: reads the PAT and
// base ids from .env, wraps the Airtable REST + meta APIs with the same
// per-base throttle the app uses (~4.5 req/s), batches writes at 10/req with
// retry/backoff on 429/5xx, and provides a deterministic PRNG + a JSON state
// file so the (large) seed is reproducible and resumable.
//
// Nothing here imports the app: these are plain .mjs ops scripts, the same
// pattern as scripts/airtable-*.mjs. Airtable is addressed by table NAME.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

// ── env ─────────────────────────────────────────────────────────────────────
let _env = null;
function loadEnv() {
  if (_env) return _env;
  _env = { ...process.env };
  const p = join(ROOT, ".env");
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) _env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  }
  return _env;
}
export function env(key, required = false) {
  const v = loadEnv()[key] || "";
  if (required && !v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const PAT = () => env("AIRTABLE_PAT", true);
export const CONTROL_BASE = () => env("AIRTABLE_CONTROL_BASE_ID", true);
export const WORKSPACE = () => env("AIRTABLE_WORKSPACE_ID", true);

// ── throttle (per-base, ~4.5 req/s to stay under Airtable's 5/s/base) ─────────
const MIN_INTERVAL_MS = 220;
const _nextAt = new Map();
function throttle(baseId) {
  const now = Date.now();
  const at = Math.max(now, _nextAt.get(baseId) ?? 0);
  _nextAt.set(baseId, at + MIN_INTERVAL_MS);
  const wait = at - now;
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── low-level request with retry/backoff ──────────────────────────────────────
async function api(baseId, url, init = {}, { retries = 5 } = {}) {
  for (let attempt = 0; ; attempt++) {
    await throttle(baseId);
    let res;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${PAT()}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (netErr) {
      if (attempt >= retries) throw netErr;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      return text ? JSON.parse(text) : undefined;
    }
    const body = await res.text();
    // 429 (rate) and 5xx (transient) → backoff + retry.
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(Math.min(8000, 600 * 2 ** attempt));
      continue;
    }
    throw new Error(`Airtable ${init.method ?? "GET"} ${url} → HTTP ${res.status}: ${body}`);
  }
}

const DATA = "https://api.airtable.com/v0";
const META = "https://api.airtable.com/v0/meta";

// ── meta API (schema) ─────────────────────────────────────────────────────────
export async function metaGet(path) {
  return api("_meta", `${META}/${path}`);
}
export async function metaPost(path, body) {
  return api("_meta", `${META}/${path}`, { method: "POST", body: JSON.stringify(body) });
}
export async function metaPatch(path, body) {
  return api("_meta", `${META}/${path}`, { method: "PATCH", body: JSON.stringify(body) });
}
export async function readBaseSchema(baseId) {
  return (await metaGet(`bases/${baseId}/tables`)).tables;
}

// ── data API (records) ────────────────────────────────────────────────────────
export async function listAll(baseId, table, { filterByFormula, fields } = {}) {
  const out = [];
  let offset;
  do {
    const p = new URLSearchParams({ pageSize: "100" });
    if (filterByFormula) p.set("filterByFormula", filterByFormula);
    if (offset) p.set("offset", offset);
    for (const f of fields ?? []) p.append("fields[]", f);
    const j = await api(baseId, `${DATA}/${baseId}/${encodeURIComponent(table)}?${p}`);
    out.push(...(j.records ?? []));
    offset = j.offset;
  } while (offset);
  return out;
}

/** Create records (typecast on) in batches of 10. Returns created records
 *  (with ids), in input order. */
export async function createAll(baseId, table, rows, { onProgress } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const j = await api(baseId, `${DATA}/${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      body: JSON.stringify({ records: batch.map((fields) => ({ fields })), typecast: true }),
    });
    out.push(...(j.records ?? []));
    if (onProgress) onProgress(out.length, rows.length);
  }
  return out;
}

export async function deleteAll(baseId, table, ids) {
  for (let i = 0; i < ids.length; i += 10) {
    const p = new URLSearchParams();
    for (const id of ids.slice(i, i + 10)) p.append("records[]", id);
    await api(baseId, `${DATA}/${baseId}/${encodeURIComponent(table)}?${p}`, { method: "DELETE" });
  }
}

export async function updateAll(baseId, table, recs) {
  const out = [];
  for (let i = 0; i < recs.length; i += 10) {
    const batch = recs.slice(i, i + 10);
    const j = await api(baseId, `${DATA}/${baseId}/${encodeURIComponent(table)}`, {
      method: "PATCH",
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    out.push(...(j.records ?? []));
  }
  return out;
}

// ── deterministic PRNG (mulberry32) ───────────────────────────────────────────
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    picks: (arr, n) => {
      const c = [...arr];
      const out = [];
      for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(next() * c.length), 1)[0]);
      return out;
    },
    bool: (p = 0.5) => next() < p,
    weighted: (pairs) => {
      // pairs: [[value, weight], ...]
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of pairs) {
        r -= w;
        if (r <= 0) return v;
      }
      return pairs[pairs.length - 1][0];
    },
  };
}

// ── date helpers (deterministic; no Date.now dependence for reproducibility) ──
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
export function addDays(d, n) {
  const c = new Date(d.getTime());
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
export function monthKey(d) {
  return d.toISOString().slice(0, 7);
}

// ── state file (resumable seeds) ──────────────────────────────────────────────
const STATE_PATH = join(HERE, "state.json");
export function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}
export function saveState(state) {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
export function mergeState(patch) {
  const s = loadState();
  const next = { ...s, ...patch };
  saveState(next);
  return next;
}

export function log(...args) {
  console.log(...args);
}
