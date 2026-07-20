// Shared, spec-driven record editor — the generalised form of the Action Hub's
// per-row edit page (ActionEditor). A window describes its editable fields once
// as a RecordEditorConfig; the generic <RecordEditor> renders the form, the
// generic updateRecordDetail server action saves it through recordWriter, and
// suggestRecordEdits provides the "AI suggest / auto-fill" pass. Config is pure
// data (no functions) so it crosses the server→client boundary intact.

import type { WritableTable } from "./recordWriter";

export type EditorFieldType =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox";

/** One editable field. `name` is the recordWriter (app) data key — the same key
 *  the field map keys off. `options` drives a <select>. `aiFillable` includes the
 *  field in the AI-assist prompt/return. `readOnly` renders it as static text and
 *  never submits it. */
export interface EditorField {
  name: string;
  label: string;
  type: EditorFieldType;
  options?: readonly { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** Span the full grid width (default: half on sm+). */
  full?: boolean;
  aiFillable?: boolean;
  readOnly?: boolean;
  help?: string;
  required?: boolean;
  /** Date fields only: reject dates before today (native `min`), matching the
   *  DateField behavior on the New-record forms. */
  noPast?: boolean;
}

export interface RecordEditorConfig {
  /** recordWriter table key — writes route through it. */
  table: WritableTable;
  /** Singular noun for headings ("decision", "risk"). */
  noun: string;
  /** Org-relative list path to return to on save/cancel ("/decisions"). */
  listPath: string;
  /** Domain sentence that primes the AI-assist system prompt. */
  aiRole: string;
  fields: EditorField[];
}

/** Form-ready values keyed by field name (strings for text/select/date, number
 *  for number, boolean for checkbox). */
export type EditorValues = Record<string, string | number | boolean>;

/** Format a Date|string|null as the YYYY-MM-DD an <input type="date"> expects.
 *  Mirrors toDateInput() in the original ActionEditor. */
export function dateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === "string" ? d.slice(0, 10) : "";
  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return iso.slice(0, 10);
}

/** Minimal per-field descriptor the server actions need at runtime (they don't
 *  receive the full config — only what rides in the hidden form inputs). */
export interface FieldSpecLite {
  name: string;
  type: EditorFieldType;
  readOnly?: boolean;
}

/** The AI-fillable subset, described for the suggest prompt. */
export interface AiFieldLite {
  name: string;
  label: string;
  type: EditorFieldType;
  options?: readonly { value: string; label: string }[];
}

export function toSpecLite(fields: EditorField[]): FieldSpecLite[] {
  return fields.map((f) => ({ name: f.name, type: f.type, readOnly: f.readOnly }));
}

export function toAiFields(fields: EditorField[]): AiFieldLite[] {
  return fields
    .filter((f) => f.aiFillable && !f.readOnly)
    .map((f) => ({ name: f.name, label: f.label, type: f.type, options: f.options }));
}
