// Airtable migration — field codecs + record mapping.
//
// Each codec translates one app value to/from its Airtable cell form. These
// encapsulate the Prisma->Airtable type rules from the migration audit:
//   - Int FKs            -> linked records (arrays of record IDs)
//   - Decimal money      -> Number (compute in app with decimal.js, never here)
//   - status/priority    -> single-select (optionally value-mapped)
//   - JSON-as-String     -> long text holding JSON
//   - DateTime/@db.Date  -> Date cells

import type { AirtableRecord, Codec, FieldDef } from "./types";

/** Plain text / long text / number / boolean — passthrough with null-safety.
 *  `undefined` is omitted so a partial PATCH leaves the field untouched, but an
 *  explicit `null` is preserved and sent to Airtable to CLEAR the cell (the only
 *  way to erase a value; an empty string is dropped upstream by present()). */
export function passthrough<T>(): Codec<T | null> {
  return {
    toCell: (v) => (v === undefined ? undefined : v),
    fromCell: (c) => (c === undefined ? null : (c as T)),
  };
}

/** A JSON blob stored as Airtable long text. */
export function jsonText<T>(fallback: T): Codec<T> {
  return {
    toCell: (v) => JSON.stringify(v),
    fromCell: (c) => {
      if (typeof c !== "string" || c === "") return fallback;
      try {
        return JSON.parse(c) as T;
      } catch {
        return fallback;
      }
    },
  };
}

/** Single-select with optional value mapping between app and Airtable option
 *  names (e.g. "proposed" <-> "Pending"). Unmapped values pass through. */
export function mappedSelect(appToAir: Record<string, string> = {}): Codec<string | null> {
  const airToApp: Record<string, string> = {};
  for (const [app, air] of Object.entries(appToAir)) airToApp[air] = app;
  return {
    toCell: (v) => (v == null ? undefined : (appToAir[v] ?? v)),
    fromCell: (c) => (typeof c === "string" ? (airToApp[c] ?? c) : null),
  };
}

/** A to-one relation: app holds a single record ID (or null); the cell is an
 *  array of linked record IDs. */
export function linkedOne(): Codec<string | null> {
  return {
    toCell: (v) => (v ? [v] : []),
    fromCell: (c) => (Array.isArray(c) && c.length > 0 ? (c[0] as string) : null),
  };
}

/** A to-many relation: app holds record IDs; the cell is the same array. */
export function linkedMany(): Codec<string[]> {
  return {
    toCell: (v) => v,
    fromCell: (c) => (Array.isArray(c) ? (c as string[]) : []),
  };
}

/** Map an Airtable record (fields keyed by field NAME) to an app object.
 *  Names are used (not ids) because they are stable across cloned per-customer
 *  bases; field ids are unique per base. */
export function recordToApp(rec: AirtableRecord, fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = { id: rec.id };
  for (const f of fields) {
    out[f.app] = f.codec.fromCell(rec.fields[f.app]);
  }
  return out;
}

/** Build an Airtable `fields` object (keyed by field NAME) from an app object.
 *  Omits undefined cells so PATCH leaves untouched fields alone. Field NAME
 *  (not id) so the same write works against any cloned base. */
export function appToFields(
  app: Record<string, unknown>,
  fields: FieldDef[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!(f.app in app)) continue;
    const cell = f.codec.toCell(app[f.app]);
    if (cell !== undefined) out[f.app] = cell;
  }
  return out;
}
