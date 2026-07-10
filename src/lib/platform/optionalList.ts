// Tolerant list read for optional per-base tables.
//
// Domain extension tables (Variations, Quotes, Meeting Minutes, Weekly
// Reports, Room Matrix) are optional: a base supplied via the existing-base-id
// onboarding path can predate them (and the spec-12 table renames are still
// pending on some bases). Airtable answers a request for a non-existent table
// with 403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND, so a missing table must
// read as empty rather than crash the caller. Genuine auth failures
// (bad/expired PAT → 401) still propagate.
//
// A missing table is remembered per (org, table) for MISSING_RETRY_MS so the
// doomed request isn't re-issued on every render — the read cache can't help
// here because it never caches rejections. The flip side: a table added to a
// base mid-flight (e.g. by the rename migration) takes up to that long to be
// noticed.

import { AirtableError, core } from "@/lib/airtable";
import type { CoreRow, CoreTableName, ListOptions } from "@/lib/airtable";
import { logger } from "@/lib/logger";

const MISSING_RETRY_MS = 10 * 60_000;
const missingUntil = new Map<string, number>();

function isMissingTable(err: unknown): boolean {
  return (
    err instanceof AirtableError &&
    (err.status === 403 || err.status === 404) &&
    /MODEL_NOT_FOUND|NOT_FOUND/.test(err.body)
  );
}

/** List an optional table, returning [] when the base doesn't have it. */
export async function listOptional(
  orgSlug: string,
  table: CoreTableName,
  opts: ListOptions = {},
): Promise<CoreRow[]> {
  const key = `${orgSlug}/${table}`;
  if ((missingUntil.get(key) ?? 0) > Date.now()) return [];
  try {
    const rows = await core.list(orgSlug, table, opts);
    missingUntil.delete(key);
    return rows;
  } catch (err) {
    if (isMissingTable(err)) {
      missingUntil.set(key, Date.now() + MISSING_RETRY_MS);
      logger.warn("Optional table missing from base — reading as empty", {
        org: orgSlug,
        table,
        retryInMs: MISSING_RETRY_MS,
      });
      return [];
    }
    throw err;
  }
}
