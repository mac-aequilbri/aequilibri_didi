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

import { airtableEnabled, core } from "@/lib/airtable";
import type { CoreTableName } from "@/lib/airtable/schema.generated";
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
