// Airtable migration — shared types for the data-access layer.

/** A record as returned by the Airtable REST API. With our client, `fields` is
 *  always keyed by field ID (returnFieldsByFieldId=true) so callers never
 *  depend on display names, which can drift between cloned bases. */
export interface AirtableRecord {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
}

export interface ListOptions {
  maxRecords?: number;
  pageSize?: number;
  /** Airtable formula language, e.g. `{fldXXX}='Made'`. */
  filterByFormula?: string;
  view?: string;
}

/** Translates one app value to/from its Airtable cell representation. */
export interface Codec<TApp = unknown> {
  toCell(value: TApp): unknown;
  fromCell(cell: unknown): TApp;
}

/** Binds one app property to one Airtable field, with the codec between them. */
export interface FieldDef {
  /** App-facing property name. */
  app: string;
  /** Stable Airtable field ID (fld…). */
  fieldId: string;
  codec: Codec;
}
