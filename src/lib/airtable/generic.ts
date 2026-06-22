// Airtable migration — generic, schema-driven Core table access.
//
// The bulk mechanism for the canonical Airtable model. Field maps are built
// automatically from schema.generated.ts, picking a codec by Airtable field
// type — so no per-field hand-mapping is needed for the 12 Core tables. App
// rows are keyed by the Airtable field NAME (verbatim, e.g. "Decision_Name"),
// with `id` as the record ID.
//
// Tenancy is structural: callers pass an org slug, which resolves to that
// client's base. There is no orgId to forget — the wrong-base risk is the only
// isolation concern, and base resolution derives from the org, never input.

import { createRecords, deleteRecords, getRecord, listRecords, updateRecords } from "./client";
import { airtableEnabled, resolveBaseId } from "./config";
import { appToFields, linkedMany, passthrough, recordToApp } from "./codecs";
import { CORE_SCHEMA, type CoreTableName } from "./schema.generated";
import type { Codec, FieldDef, ListOptions } from "./types";

const boolCodec: Codec<boolean> = {
  toCell: (v) => (typeof v === "boolean" ? v : undefined),
  fromCell: (c) => c === true,
};

function codecForType(type: string): Codec {
  switch (type) {
    case "multipleRecordLinks":
    case "multipleSelects":
      return linkedMany() as Codec;
    case "number":
    case "currency":
    case "percent":
    case "rating":
    case "duration":
    case "autoNumber":
      return passthrough<number>() as Codec;
    case "checkbox":
      return boolCodec as Codec;
    default:
      // text/longtext/singleSelect/date/dateTime/url/email/phone/attachments
      return passthrough<unknown>();
  }
}

const fieldDefCache = new Map<string, FieldDef[]>();

function fieldDefs(table: CoreTableName): FieldDef[] {
  const cached = fieldDefCache.get(table);
  if (cached) return cached;
  const defs: FieldDef[] = CORE_SCHEMA[table].fields.map((f) => ({
    app: f.name,
    fieldId: f.id,
    codec: codecForType(f.type),
  }));
  fieldDefCache.set(table, defs);
  return defs;
}

export type CoreRow = Record<string, unknown> & { id: string };

function tableId(table: CoreTableName): string {
  return CORE_SCHEMA[table].tableId;
}

function assertWritable(): void {
  if (!airtableEnabled()) {
    throw new Error("Airtable writes are disabled (set AIRTABLE_MIGRATION=true to enable).");
  }
}

/** List rows from a Core table in an org's base. Read-only — usable now. */
export async function list(
  orgSlug: string,
  table: CoreTableName,
  opts: ListOptions = {},
): Promise<CoreRow[]> {
  const recs = await listRecords(await resolveBaseId(orgSlug), tableId(table), opts);
  return recs.map((r) => recordToApp(r, fieldDefs(table)) as CoreRow);
}

/** Fetch one row by record ID. */
export async function get(
  orgSlug: string,
  table: CoreTableName,
  recordId: string,
): Promise<CoreRow> {
  const rec = await getRecord(await resolveBaseId(orgSlug), tableId(table), recordId);
  return recordToApp(rec, fieldDefs(table)) as CoreRow;
}

/** Create a row (keyed by field name). Gated behind the migration flag. */
export async function create(
  orgSlug: string,
  table: CoreTableName,
  data: Record<string, unknown>,
): Promise<CoreRow> {
  assertWritable();
  const fields = appToFields(data, fieldDefs(table));
  const [rec] = await createRecords(await resolveBaseId(orgSlug), tableId(table), [fields]);
  return recordToApp(rec, fieldDefs(table)) as CoreRow;
}

/** Merge-update a row by record ID. Gated behind the migration flag. */
export async function update(
  orgSlug: string,
  table: CoreTableName,
  recordId: string,
  patch: Record<string, unknown>,
): Promise<CoreRow> {
  assertWritable();
  const fields = appToFields(patch, fieldDefs(table));
  const [rec] = await updateRecords(await resolveBaseId(orgSlug), tableId(table), [
    { id: recordId, fields },
  ]);
  return recordToApp(rec, fieldDefs(table)) as CoreRow;
}

/** Delete rows by record ID. Gated behind the migration flag. */
export async function remove(
  orgSlug: string,
  table: CoreTableName,
  recordIds: string[],
): Promise<void> {
  assertWritable();
  await deleteRecords(await resolveBaseId(orgSlug), tableId(table), recordIds);
}
