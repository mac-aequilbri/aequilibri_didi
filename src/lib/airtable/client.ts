// Airtable migration — low-level REST client.
//
// A thin wrapper over fetch (Node 20+/Next global fetch — no SDK dependency).
// Responsibilities: auth, per-base rate limiting, pagination on reads, and
// batching on writes (Airtable caps writes at 10 records/request). Tables and
// fields are addressed by NAME, not id: provisioned per-customer bases are
// structural clones with identical names but DIFFERENT table/field ids, so name
// addressing is the only thing that works across every base.
//
// NOTE: Airtable has no transactions. Multi-record writes can partially
// succeed; callers needing atomicity must use the propose/confirm queue
// (PlatPendingWrite) and idempotent retries.

import { airtablePat } from "./config";
import { throttle } from "./rateLimiter";
import { TtlCache } from "./ttlCache";
import type { AirtableRecord, ListOptions } from "./types";

const API_ROOT = "https://api.airtable.com/v0";

// Short-TTL read cache. A single page render fans out many list() calls and
// several of them hit the SAME table (nav counts + page data), while the
// per-base rate limiter spaces every API request ~220ms apart — so duplicate
// reads cost real wall-clock time, not just quota. Caching reads for a few
// seconds collapses duplicates within a render and across quick navigations.
// Any write through this client evicts that base+table, so in-app
// write-then-read stays consistent; only edits made directly in the Airtable
// UI (or by other processes) can be up to READ_TTL_MS stale.
const READ_TTL_MS = 15_000;
const readCache = new TtlCache<unknown>(READ_TTL_MS);

// A `maxRecords` at or above this is a DISPLAY CEILING, not a hard limit: the
// platform's list/detail/dashboard sources pass 200/500 to bound the common
// case, but a data-rich org (e.g. a law firm carrying thousands of matters, and
// their phases/cashflows/budget lines) must still render *everything*. So a cap
// this large is treated as "fetch all pages" — pagination is followed to the
// end. Genuine top-N limits (existence probes, "recent N" lists) pass a small
// maxRecords (1/5/10/25) and are honoured exactly. Change the threshold, not the
// call sites, to retune what counts as "uncapped".
const UNCAP_THRESHOLD = 100;

const tablePrefix = (baseId: string, table: string): string => `${baseId}/${table} `;

// Per-base timestamp of the last in-process write. Derived caches whose source
// spans several tables (e.g. the nav-counts snapshot on the org registry row)
// can't be evicted table-by-table like readCache — they compare against this
// instead, so a write anywhere in the base makes them recompute.
const lastWrite = new Map<string, number>();

/** Milliseconds-epoch of the last write this process made to `baseId` (0 if
 *  none). Bounds staleness for cross-table derived caches. */
export function lastWriteAt(baseId: string): number {
  return lastWrite.get(baseId) ?? 0;
}

function invalidateTable(baseId: string, table: string): void {
  readCache.deletePrefix(tablePrefix(baseId, table));
  lastWrite.set(baseId, Date.now());
}

export interface AirtableErrorContext {
  baseId?: string;
  method?: string;
  /** Table segment of the path (the resource being addressed), if derivable. */
  resource?: string;
}

export class AirtableError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly context?: AirtableErrorContext,
  ) {
    const ctx = context
      ? ` [${context.method ?? "GET"} ${context.baseId ?? "?"}/${context.resource ?? "?"}]`
      : "";
    super(`Airtable API error ${status}${ctx}: ${body}`);
    this.name = "AirtableError";
  }
}

async function request(baseId: string, path: string, init: RequestInit): Promise<unknown> {
  return throttle(baseId, async () => {
    const res = await fetch(`${API_ROOT}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${airtablePat()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      // Surface which base + resource failed — a bare "403" is undiagnosable.
      const afterBase = path.startsWith(`${baseId}/`) ? path.slice(baseId.length + 1) : path;
      const resource = decodeURIComponent(afterBase.split("?")[0].split("/")[0] || "");
      throw new AirtableError(res.status, await res.text(), {
        baseId,
        method: init.method ?? "GET",
        resource,
      });
    }
    // DELETE/204 has no JSON body for some endpoints; guard accordingly.
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface ListResponse {
  records: AirtableRecord[];
  offset?: string;
}

/** List records, transparently following pagination. Cached for READ_TTL_MS
 *  per (base, table, opts); any write to the table evicts it. */
export function listRecords(
  baseId: string,
  table: string,
  opts: ListOptions = {},
): Promise<AirtableRecord[]> {
  const key = `${tablePrefix(baseId, table)}list:${JSON.stringify(opts)}`;
  return readCache.get(key, () => fetchAllRecords(baseId, table, opts)) as Promise<
    AirtableRecord[]
  >;
}

async function fetchAllRecords(
  baseId: string,
  table: string,
  opts: ListOptions,
): Promise<AirtableRecord[]> {
  // A large maxRecords is a display ceiling to lift, not a hard cap (see
  // UNCAP_THRESHOLD): fetch every page for it. Only a small maxRecords is a real
  // top-N limit that bounds both the API request and the pagination loop.
  const hardCap =
    opts.maxRecords && opts.maxRecords < UNCAP_THRESHOLD ? opts.maxRecords : undefined;
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    if (opts.pageSize) params.set("pageSize", String(opts.pageSize));
    if (hardCap) params.set("maxRecords", String(hardCap));
    if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
    if (opts.view) params.set("view", opts.view);
    if (offset) params.set("offset", offset);

    const data = (await request(baseId, `${baseId}/${encodeURIComponent(table)}?${params}`, {
      method: "GET",
    })) as ListResponse;

    out.push(...data.records);
    offset = data.offset;
    if (hardCap && out.length >= hardCap) break;
  } while (offset);
  return out;
}

export interface PageOptions {
  filterByFormula?: string;
  sort?: Array<{ field: string; direction: "asc" | "desc" }>;
  pageSize?: number;
  /** Airtable pagination cursor from a previous page's response. */
  offset?: string;
}

/** Fetch ONE page of records (server-side filter/sort), returning the page plus
 *  the next-page cursor. Unlike listRecords this does NOT follow pagination or
 *  cache — it's the primitive behind true server-side pagination for data-rich
 *  tables (e.g. a firm's thousands of matters), where fetching the whole table
 *  to slice client-side is the bottleneck. */
export async function listPage(
  baseId: string,
  table: string,
  opts: PageOptions = {},
): Promise<{ records: AirtableRecord[]; offset?: string }> {
  const params = new URLSearchParams();
  params.set("pageSize", String(opts.pageSize ?? 50));
  if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
  (opts.sort ?? []).forEach((s, i) => {
    params.set(`sort[${i}][field]`, s.field);
    params.set(`sort[${i}][direction]`, s.direction);
  });
  if (opts.offset) params.set("offset", opts.offset);
  const data = (await request(baseId, `${baseId}/${encodeURIComponent(table)}?${params}`, {
    method: "GET",
  })) as ListResponse;
  return { records: data.records, offset: data.offset };
}

/** Fetch a single record by ID. Cached like listRecords. */
export function getRecord(
  baseId: string,
  table: string,
  recordId: string,
): Promise<AirtableRecord> {
  const key = `${tablePrefix(baseId, table)}get:${recordId}`;
  return readCache.get(key, async () => {
    return (await request(baseId, `${baseId}/${encodeURIComponent(table)}/${recordId}`, {
      method: "GET",
    })) as AirtableRecord;
  }) as Promise<AirtableRecord>;
}

/** Create records (fields keyed by field ID), batched at 10/request. */
export async function createRecords(
  baseId: string,
  table: string,
  records: Array<Record<string, unknown>>,
): Promise<AirtableRecord[]> {
  invalidateTable(baseId, table);
  const out: AirtableRecord[] = [];
  for (const batch of chunk(records, 10)) {
    const data = (await request(baseId, `${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      body: JSON.stringify({
        records: batch.map((fields) => ({ fields })),
        // Coerce values and auto-create missing single-select options on write.
        typecast: true,
      }),
    })) as ListResponse;
    out.push(...data.records);
  }
  invalidateTable(baseId, table);
  return out;
}

/** Update records (PATCH = merge), batched at 10/request. */
export async function updateRecords(
  baseId: string,
  table: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>,
): Promise<AirtableRecord[]> {
  invalidateTable(baseId, table);
  const out: AirtableRecord[] = [];
  for (const batch of chunk(records, 10)) {
    const data = (await request(baseId, `${baseId}/${encodeURIComponent(table)}`, {
      method: "PATCH",
      body: JSON.stringify({ records: batch, typecast: true }),
    })) as ListResponse;
    out.push(...data.records);
  }
  invalidateTable(baseId, table);
  return out;
}

/** Delete records by ID, batched at 10/request. */
export async function deleteRecords(
  baseId: string,
  table: string,
  recordIds: string[],
): Promise<void> {
  invalidateTable(baseId, table);
  for (const batch of chunk(recordIds, 10)) {
    const params = new URLSearchParams();
    for (const id of batch) params.append("records[]", id);
    await request(baseId, `${baseId}/${encodeURIComponent(table)}?${params}`, { method: "DELETE" });
  }
  invalidateTable(baseId, table);
}
