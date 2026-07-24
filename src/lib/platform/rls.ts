// Governance Phase 3 — row-level security (§3/§7): a user sees only the JOBS
// their TEAM record links to. The org base's TEAM table (Customer
// Configuration tier) carries an Email + JOBS multipleRecordLinks per member.
//
// Tolerant by design: TEAM is unpopulated until D7 lands, and older bases may
// lack the table entirely. Whenever the user's assignments can't be resolved
// (table missing, no row for the email, no JOBS links, Postgres mode), scoping
// is OFF (null = whole tenant) — RLS tightens as TEAM data arrives, and never
// bricks an org. Administrator, Auditor, and Business Owner bypass via
// rlsExempt() at the call sites.

import { cache } from "react";
import { airtableEnabled, core } from "@/lib/airtable";
import type { CoreTableName } from "@/lib/airtable/schema.generated";
import { getCurrentViewer } from "./org-context";
import { rlsExempt } from "./roles";
import type { OrgCtx } from "./types";

// TEAM is Customer Configuration — never cloned from the template, so it's
// absent from the generated table union; addressed by name, read tolerantly.
const TEAM = "TEAM" as CoreTableName;

/** Airtable JOBS record ids the user is assigned to, or null = unscoped. */
export async function assignedJobRecIds(
  ctx: OrgCtx,
  email: string,
): Promise<ReadonlySet<string> | null> {
  if (!airtableEnabled() || !email) return null;
  try {
    const rows = await core.list(ctx.orgSlug, TEAM, { maxRecords: 500 });
    const mine = rows.find(
      (r) => typeof r["Email"] === "string" && r["Email"].toLowerCase() === email.toLowerCase(),
    );
    const links = mine?.["JOBS"] ?? mine?.["Jobs"] ?? mine?.["Job"];
    if (!Array.isArray(links) || links.length === 0) return null;
    return new Set(links.map(String));
  } catch {
    return null; // TEAM table absent/unreadable — no scoping
  }
}

// ── Job scope (governance §3/§7 RLS enforcement) ──────────────────────────────
// A viewer's row visibility resolves to one of three modes. Non-exempt roles
// see only their assigned JOBS; org-global rows (no Job link) are always visible.

export type JobScope =
  | { mode: "all" } // exempt role, or unresolved while fail-open (see rlsEnforce)
  | { mode: "some"; jobIds: ReadonlySet<string> }
  | { mode: "none" }; // explicitly no assignments, only while enforcing

/** Rollout gate. Until per-base TEAM assignments (Email + JOBS) are populated,
 *  scoping stays fail-OPEN: an unresolved viewer sees everything, so enabling
 *  the code path never bricks an org. Set PROJECT_RLS_ENFORCE=true for a base
 *  whose TEAM is populated to flip unresolved → see-nothing (fail-closed). */
export function rlsEnforce(): boolean {
  return process.env.PROJECT_RLS_ENFORCE === "true";
}

/** Resolve a viewer to a job scope. Exempt (Administrator/Auditor/Business
 *  Owner) → all. Otherwise the viewer's TEAM→JOBS assignment; unresolved
 *  (no data / Postgres / table absent) obeys the fail-open/closed gate. */
export async function resolveJobScope(
  ctx: OrgCtx,
  viewer: { email: string; role: string },
): Promise<JobScope> {
  if (rlsExempt(viewer.role)) return { mode: "all" };
  const assigned = await assignedJobRecIds(ctx, viewer.email);
  if (assigned === null) return rlsEnforce() ? { mode: "none" } : { mode: "all" };
  return { mode: "some", jobIds: assigned };
}

/** The current request's viewer scope, resolved once (React-cached per request
 *  so many list sources on one page share a single TEAM read). Redirects from
 *  getCurrentViewer (denied non-member) propagate as normal. */
export const currentJobScope = cache(async (ctx: OrgCtx): Promise<JobScope> => {
  const viewer = await getCurrentViewer(ctx);
  return resolveJobScope(ctx, viewer);
});

/** Does the scope admit a single record with this job? `all` → always; a
 *  null/absent job is org-global and always visible; `none` → only org-global;
 *  `some` → the record's job is among the assigned set. The single-record twin
 *  of scopeRows — used by detail-page and write-path guards. */
export function inScope(scope: JobScope, jobId: string | null | undefined): boolean {
  if (scope.mode === "all") return true;
  if (jobId == null) return true; // org-global record
  if (scope.mode === "none") return false;
  return scope.jobIds.has(jobId);
}

/** Filter rows to a job scope. `all` → passthrough; `some` → rows on an assigned
 *  job OR with no job (org-global); `none` → only the no-job (org-global) rows.
 *  Pure — the seam every list/read path funnels through. */
export function scopeRows<T>(
  rows: T[],
  jobIdOf: (row: T) => string | null | undefined,
  scope: JobScope,
): T[] {
  if (scope.mode === "all") return rows;
  return rows.filter((r) => inScope(scope, jobIdOf(r)));
}

/** Convenience: resolve the current viewer's scope and filter an already-loaded
 *  list by each row's job. Call at the end of a list source's loader. */
export async function scopeByJob<T>(
  ctx: OrgCtx,
  rows: T[],
  jobIdOf: (row: T) => string | null | undefined,
): Promise<T[]> {
  return scopeRows(rows, jobIdOf, await currentJobScope(ctx));
}

/** Detail-page guard: is a freshly-fetched raw record in the viewer's scope?
 *  Reads the job from either an Airtable "Job" link array or a Postgres jobId
 *  scalar. A null record passes through (the loader's own not-found handling
 *  takes over). Call right after fetching, before mapping to a view. */
export async function recordInScope(
  ctx: OrgCtx,
  rec: Record<string, unknown> | null | undefined,
): Promise<boolean> {
  if (!rec) return true;
  const link = rec["Job"];
  const jobId =
    Array.isArray(link) && link.length > 0
      ? String(link[0])
      : rec["jobId"] != null
        ? String(rec["jobId"])
        : null;
  return inScope(await currentJobScope(ctx), jobId);
}
