// Airtable migration — shared types for the data-access layer.

/** A record as returned by the Airtable REST API. With our client, `fields` is
 *  keyed by field NAME: provisioned per-customer bases are structural clones
 *  with identical field names but different field ids, so names — not ids — are
 *  the stable key across bases. */
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
  /** App-facing property name. Also the Airtable field NAME used on the wire
   *  (reads/writes key cells by name, for cross-base clone stability). */
  app: string;
  /** Airtable field id from the template base. Informational only — not used
   *  on the wire, since ids differ per cloned base. */
  fieldId: string;
  codec: Codec;
}
