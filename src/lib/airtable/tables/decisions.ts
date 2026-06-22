// Airtable migration — DECISIONS table binding (first wired table / spike).
//
// Field IDs reconciled against the live AEQUILIBRI_DIDI_DEMO base
// (table tblsHgiXa0Efo3IWD) on 2026-06-19. The live Airtable schema is the
// canonical one and is RICHER than PlatDecision: it has a required primary
// `Decision_Name`, links Owner->TEAM and to WORKSTREAMS/ACTION_HUB (not JOBS),
// and adds Reversibility/Confidence/Context/etc. App writes must supply
// Decision_Name. See docs/airtable-migration-mapping.md §10.

import { createRecords, listRecords, updateRecords } from "../client";
import { airtableEnabled } from "../config";
import { appToFields, jsonText, linkedOne, mappedSelect, passthrough, recordToApp } from "../codecs";
import type { FieldDef, ListOptions } from "../types";

export const DECISIONS_TABLE = "tblsHgiXa0Efo3IWD";

/** App-facing shape for a decision. A superset-aware subset: the fields the
 *  app reads/writes today, plus the canonical Airtable extras it should grow
 *  into. `id` is the Airtable record ID once persisted. */
export interface DecisionApp {
  id?: string;
  name: string; // -> Decision_Name (primary, required)
  description: string | null;
  rationale: string | null;
  alternatives: string | null;
  status: string | null; // proposed|confirmed|reversed <-> Pending|Made|Reversed
  ownerId: string | null; // linked TEAM record ID
  decidedAt: string | null;
  decisionType: string | null;
  context: string | null;
  notes: string | null;
}

export const decisionFields: FieldDef[] = [
  { app: "name", fieldId: "fldIDXimKr7PBC41e", codec: passthrough<string>() },
  { app: "description", fieldId: "fldz30kBm8F3cyeG6", codec: passthrough<string>() },
  { app: "rationale", fieldId: "fldXH5tHvUC8RpuCi", codec: passthrough<string>() },
  { app: "alternatives", fieldId: "fld6bddEWs7EQHqGp", codec: passthrough<string>() },
  {
    app: "status",
    fieldId: "fldvggciokLYyx5FQ",
    codec: mappedSelect({ proposed: "Pending", confirmed: "Made", reversed: "Reversed" }),
  },
  { app: "ownerId", fieldId: "fldBnBOU8MG66EW2z", codec: linkedOne() },
  { app: "decidedAt", fieldId: "fldtrM1uTnlpf88Si", codec: passthrough<string>() },
  { app: "decisionType", fieldId: "fldFyep7Zdj1TyGB5", codec: passthrough<string>() },
  { app: "context", fieldId: "fldoDHCBl7JvmLZoT", codec: passthrough<string>() },
  { app: "notes", fieldId: "fld9Bd0Q9I4aHdhcY", codec: passthrough<string>() },
];

// Reserved for when the assistant starts emitting structured decision context.
export const decisionContextJson = jsonText<Record<string, unknown>>({});

/** Read decisions from a client base. Safe (read-only) — usable now. */
export async function listDecisions(baseId: string, opts: ListOptions = {}): Promise<DecisionApp[]> {
  const recs = await listRecords(baseId, DECISIONS_TABLE, opts);
  return recs.map((r) => recordToApp(r, decisionFields) as unknown as DecisionApp);
}

function assertWritable(): void {
  if (!airtableEnabled()) {
    throw new Error("Airtable writes are disabled (set AIRTABLE_MIGRATION=true to enable).");
  }
}

/** Create a decision. Gated behind the migration flag — inert until enabled. */
export async function createDecision(baseId: string, data: DecisionApp): Promise<DecisionApp> {
  assertWritable();
  const fields = appToFields(data as unknown as Record<string, unknown>, decisionFields);
  const [rec] = await createRecords(baseId, DECISIONS_TABLE, [fields]);
  return recordToApp(rec, decisionFields) as unknown as DecisionApp;
}

/** Update a decision by record ID. Gated behind the migration flag. */
export async function updateDecision(
  baseId: string,
  recordId: string,
  patch: Partial<DecisionApp>,
): Promise<DecisionApp> {
  assertWritable();
  const fields = appToFields(patch as Record<string, unknown>, decisionFields);
  const [rec] = await updateRecords(baseId, DECISIONS_TABLE, [{ id: recordId, fields }]);
  return recordToApp(rec, decisionFields) as unknown as DecisionApp;
}
