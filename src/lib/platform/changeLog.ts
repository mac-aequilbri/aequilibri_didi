// Variation order ↔ CHANGE_LOG mapping (Spec 12 reconciliation).
//
// Spec 12 dropped the legacy VARIATIONS table; the doc-designated home for a
// variation order is CHANGE_LOG (a Change_Type="Variation" row). The write side
// lives in fieldMaps.variation_order; this module holds the read-side helpers so
// every Airtable read (list, detail, job context, highlights, search) narrows to
// variation rows and maps CHANGE_LOG's status vocabulary back to the app's.

/** CHANGE_LOG.Change_Type value the app uses for variation orders. */
export const VARIATION_CHANGE_TYPE = "Variation";

/** filterByFormula narrowing CHANGE_LOG to variation rows. */
export const VARIATION_FILTER = `{Change_Type}='${VARIATION_CHANGE_TYPE}'`;

// CHANGE_LOG Status → app variation status. The forward map (app → CHANGE_LOG)
// lives in fieldMaps.ts (VARIATION_STATUS); keep the two in sync.
const AIR_TO_APP_STATUS: Record<string, string> = {
  Proposed: "draft",
  Pending: "submitted",
  Approved: "approved",
  Rejected: "rejected",
  Implemented: "approved",
  TBC: "submitted",
};

export function variationStatusFromAir(air: unknown): string {
  const s = typeof air === "string" ? air : "";
  return AIR_TO_APP_STATUS[s] ?? (s ? s.toLowerCase() : "submitted");
}
