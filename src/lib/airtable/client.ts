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
import type { AirtableRecord, ListOptions } from "./types";

const API_ROOT = "https://api.airtable.com/v0";

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

/** List records, transparently following pagination. */
export async function listRecords(
  baseId: string,
  table: string,
  opts: ListOptions = {},
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    if (opts.pageSize) params.set("pageSize", String(opts.pageSize));
    if (opts.maxRecords) params.set("maxRecords", String(opts.maxRecords));
    if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
    if (opts.view) params.set("view", opts.view);
    if (offset) params.set("offset", offset);

    const data = (await request(baseId, `${baseId}/${encodeURIComponent(table)}?${params}`, {
      method: "GET",
    })) as ListResponse;

    out.push(...data.records);
    offset = data.offset;
    if (opts.maxRecords && out.length >= opts.maxRecords) break;
  } while (offset);
  return out;
}

/** Fetch a single record by ID. */
export async function getRecord(
  baseId: string,
  table: string,
  recordId: string,
): Promise<AirtableRecord> {
  return (await request(baseId, `${baseId}/${encodeURIComponent(table)}/${recordId}`, {
    method: "GET",
  })) as AirtableRecord;
}

/** Create records (fields keyed by field ID), batched at 10/request. */
export async function createRecords(
  baseId: string,
  table: string,
  records: Array<Record<string, unknown>>,
): Promise<AirtableRecord[]> {
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
  return out;
}

/** Update records (PATCH = merge), batched at 10/request. */
export async function updateRecords(
  baseId: string,
  table: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>,
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  for (const batch of chunk(records, 10)) {
    const data = (await request(baseId, `${baseId}/${encodeURIComponent(table)}`, {
      method: "PATCH",
      body: JSON.stringify({ records: batch, typecast: true }),
    })) as ListResponse;
    out.push(...data.records);
  }
  return out;
}

/** Delete records by ID, batched at 10/request. */
export async function deleteRecords(
  baseId: string,
  table: string,
  recordIds: string[],
): Promise<void> {
  for (const batch of chunk(recordIds, 10)) {
    const params = new URLSearchParams();
    for (const id of batch) params.append("records[]", id);
    await request(baseId, `${baseId}/${encodeURIComponent(table)}?${params}`, { method: "DELETE" });
  }
}
