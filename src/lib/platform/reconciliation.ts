// Post-write reconciliation — Spec 12 Module 2 (confirmed in scope 30 Jun
// 2026). A separate mechanism from pre-write human review: pre-write review
// catches bad extraction before the write; this catches cases where the
// correct value was proposed, reviewed, and submitted, but something dropped
// between submission and storage. After write confirmation from the Airtable
// API, each written record is re-read and its stored values compared against
// the submitted values field by field. A mismatch is never silently accepted:
// it is logged as a CORRECTIONS record with Root_Cause = Data Quality (naming
// the field, submitted value, and stored value) and surfaced to the owner as
// an open ISSUES exception.
//
// Postgres writes re-read through the same validated Prisma layer that wrote
// them, so reconciliation applies to the Airtable (system-of-record) path.

import { airtableEnabled, core } from "@/lib/airtable";
import { airtableMapFor, toFields } from "@/lib/airtable/fieldMaps";
import { emitCorrection } from "@/lib/platform/corrections";
import { logger } from "@/lib/logger";
import type { Actor, OrgCtx } from "@/lib/platform/types";

export interface FieldMismatch {
  field: string;
  submitted: string;
  stored: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Tolerant equivalence between a value submitted to Airtable and the value
 *  read back. Airtable typecasts on write ("5" → 5) and omits falsy fields
 *  (false checkbox, empty string) from reads, so exact equality would flag
 *  storage conventions as mismatches. Only genuine divergence returns false. */
export function valuesEquivalent(sent: unknown, stored: unknown): boolean {
  // Absent-on-read equals any "empty" submission (null/""/false/empty array).
  if (stored === undefined || stored === null) {
    return (
      sent === undefined ||
      sent === null ||
      sent === "" ||
      sent === false ||
      (Array.isArray(sent) && sent.length === 0)
    );
  }
  if (Array.isArray(sent) || Array.isArray(stored)) {
    const a = Array.isArray(sent) ? sent.map(str) : [str(sent)];
    const b = Array.isArray(stored) ? stored.map(str) : [str(stored)];
    return a.length === b.length && a.every((v) => b.includes(v));
  }
  // Numeric equivalence covers typecast ("5" vs 5, "5.0" vs 5).
  const an = Number(sent);
  const bn = Number(stored);
  if (str(sent).trim() !== "" && Number.isFinite(an) && Number.isFinite(bn)) return an === bn;
  return str(sent).trim() === str(stored).trim();
}

/** Field-by-field diff of the submitted Airtable payload against the stored
 *  record. Only submitted fields are compared — formulas, rollups, and fields
 *  the write never touched cannot be write drift. */
export function diffStoredVsSubmitted(
  sent: Record<string, unknown>,
  stored: Record<string, unknown>,
): FieldMismatch[] {
  const out: FieldMismatch[] = [];
  for (const [field, submitted] of Object.entries(sent)) {
    if (submitted === undefined) continue; // never sent
    if (!valuesEquivalent(submitted, stored[field])) {
      out.push({ field, submitted: str(submitted), stored: str(stored[field]) });
    }
  }
  return out;
}

/** Re-read an Airtable record just written and reconcile stored vs submitted.
 *  Best-effort by design: a reconciliation failure must never fail or undo the
 *  write it checks. Returns the mismatches found (empty = clean). */
export async function reconcileAirtableWrite(
  ctx: OrgCtx,
  table: string,
  op: "create" | "update",
  data: Record<string, unknown>,
  recordId: number | string | undefined,
  actor: Actor,
): Promise<FieldMismatch[]> {
  if (!airtableEnabled() || recordId == null || typeof recordId !== "string") return [];
  const map = airtableMapFor(table);
  if (!map) return [];

  try {
    const sent = toFields(map, data, op);
    const rec = await core.get(ctx.orgSlug, map.table, recordId);
    const mismatches = diffStoredVsSubmitted(sent, rec as Record<string, unknown>);
    if (!mismatches.length) return [];

    // Root cause on a confirmed mismatch (Spec 12): CORRECTIONS with
    // Root_Cause = Data Quality naming field, submitted and stored value.
    const jobId = typeof data.jobId === "number" ? data.jobId : undefined;
    for (const m of mismatches) {
      await emitCorrection(
        ctx,
        { type: "system", name: "Post-write reconciliation" },
        {
          jobId,
          entityType: table,
          dimension: `${table}.${m.field}`,
          aiValueText: m.submitted,
          humanValueText: m.stored,
          sourceModule: "module2",
          rootCauseCategory: "Data Quality",
          rootCause: `Post-write mismatch on ${map.table}.${m.field} (${recordId}): submitted "${m.submitted}", stored "${m.stored}". Confirm whether this was a manual edit in the base before treating it as a write error.`,
          context: { table, op, recordId },
        },
      ).catch(() => {});
    }

    // Surface as an exception for owner review: one open ISSUES record per
    // reconciliation event. Written via the field map directly — routing it
    // through writeRecord would re-trigger reconciliation on the exception
    // record itself.
    const actionMap = airtableMapFor("action");
    if (actionMap) {
      await core
        .create(
          ctx.orgSlug,
          actionMap.table,
          toFields(
            actionMap,
            {
              title: `Post-write mismatch: ${map.table} ${recordId}`,
              detail:
                `Stored values differ from the submitted payload (writer: ${actor.name}).\n` +
                mismatches
                  .map((m) => `• ${m.field}: submitted "${m.submitted}" → stored "${m.stored}"`)
                  .join("\n") +
                `\nDo not silently accept the stored value — confirm with the owner whether it was a manual edit made directly in the base.`,
              status: "open",
              priority: "P1",
              issueType: "Blocker",
              jobId,
            },
            "create",
          ),
        )
        .catch(() => {});
    }
    return mismatches;
  } catch (err) {
    logger.error("Post-write reconciliation failed", { orgId: ctx.orgId, table, recordId, err: String(err) });
    return [];
  }
}
