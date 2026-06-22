// Airtable migration — per-table app→Airtable field maps.
//
// The single place that knows how a Prisma-shaped write payload becomes an
// Airtable `fields` object (keyed by field NAME — generic.ts resolves names to
// IDs and picks codecs by type). recordWriter routes every platform write here
// when AIRTABLE_MIGRATION is on, so the maps must reproduce the hand-written
// per-action branches that shipped earlier (decisions/actions/risks/…).
//
// Design: declarative specs, presence-driven. A spec emits its Airtable field
// when the source key is present in the payload (so the SAME map serves both
// create and partial update). On create, `createDefault` supplies a value for
// keys the form omits (e.g. a status of "open"); derived fields (no `from`)
// compute on create. Linked-record fields emit only when handed an Airtable
// record id ("rec…"), never a Postgres integer — matching shipped behaviour
// where job/workstream links are left unset on write.

import type { CoreTableName } from "./schema.generated";

// ── value helpers ─────────────────────────────────────────────────────────
const S = (v: unknown): string => (v == null ? "" : String(v));
const NUM = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const BOOL = (v: unknown): boolean =>
  v === true || (typeof v === "string" && ["true", "on", "1", "yes"].includes(v.toLowerCase()));
const DATE = (v: unknown): string | undefined => (v ? S(v) : undefined);
/** A to-one link cell: an array of one record id, or undefined for non-rec ids. */
const LINK = (v: unknown): string[] | undefined =>
  typeof v === "string" && v.startsWith("rec") ? [v] : undefined;

const present = (d: Record<string, unknown>, k: string): boolean =>
  k in d && d[k] !== undefined && d[k] !== "";

// ── enum maps (only the canonical Core tables need these) ───────────────────
const DECISION_STATUS: Record<string, string> = {
  proposed: "Pending",
  confirmed: "Made",
  superseded: "Reversed",
};
const ACTION_STATUS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Complete",
  deferred: "Deferred",
};
const ACTION_PRIORITY: Record<string, string> = {
  P1: "High",
  P2: "Medium",
  P3: "Low",
};

// ── spec model ──────────────────────────────────────────────────────────────
type Op = "create" | "update";
interface FieldSpec {
  /** Airtable field name. */
  air: string;
  /** Source key in the app payload. Omit for a value derived from `to`. */
  from?: string;
  /** Transform the raw source value into a cell. Default: identity. */
  to?: (raw: unknown, data: Record<string, unknown>) => unknown;
  /** Value used on create when the source key is absent (pre-`to`). */
  createDefault?: unknown;
  /** Emit only on create. */
  createOnly?: boolean;
}

export interface AirtableMap {
  table: CoreTableName;
  specs: FieldSpec[];
}

/** Build the Airtable `fields` object for a write. */
export function toFields(
  map: AirtableMap,
  data: Record<string, unknown>,
  op: Op,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of map.specs) {
    if (s.createOnly && op !== "create") continue;
    const hasSrc = s.from ? present(data, s.from) : false;
    let raw: unknown;
    if (hasSrc) raw = data[s.from as string];
    else if (op === "create" && "createDefault" in s) raw = s.createDefault;
    else if (s.from) continue; // update with absent source → leave untouched
    const cell = s.to ? s.to(raw, data) : raw;
    if (cell !== undefined) out[s.air] = cell;
  }
  return out;
}

// ── maps, keyed by recordWriter WritableTable ───────────────────────────────
// Only tables that migrate to Airtable appear here. Omitted tables (org-side
// identity/secrets) keep the Prisma path.
export const FIELD_MAPS: Record<string, AirtableMap> = {
  // ---- Core ----
  action: {
    table: "ACTION_HUB",
    specs: [
      { air: "Action_Name", from: "title", to: (v) => S(v).slice(0, 200) || "Untitled action" },
      { air: "Description", from: "detail", to: S, createDefault: "" },
      { air: "Status", from: "status", createDefault: "open", to: (v) => ACTION_STATUS[S(v)] ?? "Open" },
      { air: "Priority", from: "priority", createDefault: "P2", to: (v) => ACTION_PRIORITY[S(v)] ?? "Medium" },
      { air: "Due_Date", from: "dueDate", to: DATE },
      { air: "Notes", from: "owner", to: (v) => (v ? `Owner: ${S(v)}` : undefined) },
    ],
  },
  decision: {
    table: "DECISIONS",
    specs: [
      { air: "Decision_Name", from: "description", to: (v) => S(v).slice(0, 120) || "Untitled decision" },
      { air: "Decision_Description", from: "description", to: S },
      { air: "Rationale", from: "rationale", to: S, createDefault: "" },
      { air: "Status", from: "status", createDefault: "proposed", to: (v) => DECISION_STATUS[S(v)] ?? "Pending" },
      { air: "Decision_Date", from: "decidedAt", to: DATE },
    ],
  },
  workstream: {
    table: "WORKSTREAMS",
    specs: [
      { air: "Workstream_Name", from: "name", to: (v) => S(v) || "Untitled workstream" },
      { air: "Description", from: "description", to: S, createDefault: "" },
      // app status (active/paused/complete) — typecast reconciles option names.
      { air: "Status", from: "status", to: S },
      { air: "Next_Milestone", from: "milestone", to: S },
    ],
  },
  job: {
    table: "JOBS",
    specs: [
      { air: "Job_Name", from: "name", to: (v) => S(v) || "Untitled job" },
      { air: "Description", from: "summary", to: S },
      { air: "Status", from: "status", to: S },
      { air: "Estimated_Value", from: "budgetTotal", to: (v) => NUM(v) },
    ],
  },
  contact: {
    table: "CONTACTS",
    specs: [
      { air: "Contact_Name", from: "name", to: (v) => S(v) || "Unnamed contact" },
      { air: "Email", from: "email", to: S },
      { air: "Phone", from: "phone", to: S },
      { air: "Role", from: "role", to: S },
      { air: "Notes", from: "notes", to: S },
    ],
  },
  document: {
    table: "DOCUMENTS",
    specs: [
      { air: "Document_Name", from: "title", to: (v) => S(v) || "Untitled document" },
      { air: "Document_Type", from: "docType", to: S },
      { air: "Drive_URL", from: "storageRef", to: S },
    ],
  },
  learning_rule: {
    table: "LEARNING_RULES",
    specs: [
      { air: "Rule_Name", from: "description", to: (v) => S(v).slice(0, 120) || "Untitled rule" },
      { air: "Rule_Description", from: "description", to: S },
      { air: "Operational_Directive", from: "category", to: S },
      { air: "Priority", from: "priority", to: (v) => NUM(v) },
      { air: "Confidence_Level", from: "confidence", to: (v) => NUM(v, 50) },
      { air: "Override_Permission", from: "cannotOverride", to: (v) => !BOOL(v) },
    ],
  },
  // ---- Domain Extension (app-shaped tables; statuses already match) ----
  risk: {
    table: "RISKS",
    specs: [
      { air: "Risk", from: "description", to: (v) => S(v).slice(0, 200) || "Untitled risk" },
      { air: "Likelihood", from: "likelihood", to: (v) => NUM(v, 3) },
      { air: "Impact", from: "impact", to: (v) => NUM(v, 3) },
      { air: "Mitigation", from: "mitigation", to: S },
      { air: "Owner", from: "owner", to: S },
      { air: "Status", from: "status", createDefault: "open", to: S },
      { air: "Escalated_At", from: "escalatedAt", to: DATE },
      { air: "Escalation_Note", from: "escalationNote", to: S },
      { air: "Created_By_AI", from: "createdByAi", to: BOOL },
      { air: "Job", from: "jobId", to: LINK },
    ],
  },
  procurement: {
    table: "PROCUREMENT",
    specs: [
      { air: "Item", from: "item", to: (v) => S(v).slice(0, 300) || "Untitled item" },
      { air: "Category", from: "category", to: S },
      { air: "Vendor_Name", from: "vendorName", to: S },
      { air: "Qty", from: "qty", to: (v) => NUM(v, 1) },
      { air: "Unit_Price", from: "unitPrice", to: (v) => NUM(v) },
      { air: "Total", from: "total", to: (v) => NUM(v) },
      { air: "Status", from: "status", createDefault: "pending", to: S },
      { air: "Due_Date", from: "dueDate", to: DATE },
      { air: "Job", from: "jobId", to: LINK },
    ],
  },
  phase: {
    table: "PHASES",
    specs: [
      { air: "Phase_Name", from: "name", to: (v) => S(v) || "Untitled phase" },
      { air: "Status", from: "status", createDefault: "pending", to: S },
      { air: "Completion_Pct", from: "completionPct", to: (v) => NUM(v) },
      { air: "Sort_Order", from: "sortOrder", to: (v) => NUM(v) },
      { air: "Is_AI_Draft", from: "isAiDraft", to: BOOL },
      { air: "Approved_By", from: "approvedBy", to: S },
      { air: "Job", from: "jobId", to: LINK },
    ],
  },
  phase_evidence: {
    table: "PHASE_EVIDENCE",
    specs: [
      { air: "Note", from: "note", to: (v) => S(v) || "Evidence" },
      { air: "Added_By", from: "addedBy", to: S },
      { air: "Phase", from: "phaseId", to: LINK },
      { air: "Document", from: "documentId", to: LINK },
      { air: "Job", from: "jobId", to: LINK },
    ],
  },
  budget_line: {
    table: "BUDGET",
    specs: [
      { air: "Budget_Line", from: "description", to: (v) => S(v) || "Budget line" },
      { air: "Category", from: "category", to: S },
      { air: "Description", from: "description", to: S },
      { air: "Budget_Amount", from: "budgetAmount", to: (v) => NUM(v) },
      { air: "Committed_Amount", from: "committedAmount", to: (v) => NUM(v) },
      { air: "Actual_Amount", from: "actualAmount", to: (v) => NUM(v) },
      { air: "Job", from: "jobId", to: LINK },
    ],
  },
  cashflow: {
    table: "CASHFLOW",
    specs: [
      { air: "Period", from: "period", to: S },
      { air: "Projected", from: "projected", to: (v) => NUM(v) },
      { air: "Actual", from: "actual", to: (v) => NUM(v) },
      { air: "Notes", from: "notes", to: S },
      { air: "Job", from: "jobId", to: LINK },
    ],
  },
  variation_order: {
    table: "VARIATIONS",
    specs: [
      { air: "Title", from: "title", to: (v) => S(v) || "Untitled variation" },
      { air: "Ref_Number", from: "refNumber", to: S },
      { air: "Description", from: "description", to: S },
      { air: "Scope_Change", from: "scopeChange", to: S },
      { air: "Cost_Impact", from: "costImpact", to: (v) => NUM(v) },
      { air: "Time_Impact_Days", from: "timeImpactDays", to: (v) => NUM(v) },
      { air: "Status", from: "status", createDefault: "draft", to: S },
      { air: "Is_AI_Drafted", from: "isAiDrafted", to: BOOL },
      { air: "AI_Draft", from: "aiDraft", to: S },
      { air: "Submitted_By", from: "submittedBy", to: S },
      { air: "Approved_By", from: "approvedBy", to: S },
      { air: "Approved_At", from: "approvedAt", to: DATE },
    ],
  },
  vendor: {
    table: "VENDORS",
    specs: [
      { air: "Vendor_Name", from: "name", to: (v) => S(v) || "Unnamed vendor" },
      { air: "Category", from: "category", to: S },
      { air: "Contact_Name", from: "contactName", to: S },
      { air: "Contact_Email", from: "contactEmail", to: S },
      { air: "Contact_Phone", from: "contactPhone", to: S },
      { air: "Rating", from: "rating", to: (v) => NUM(v, 5) },
      { air: "Notes", from: "notes", to: S },
      { air: "Is_Active", from: "isActive", to: BOOL, createDefault: true },
    ],
  },
  room: {
    table: "ROOM_MATRIX",
    specs: [
      { air: "Room_Name", from: "name", to: (v) => S(v) || "Unnamed room" },
      { air: "Zone", from: "zone", to: S },
      { air: "Area_Sqm", from: "areaSqm", to: (v) => (v == null || v === "" ? undefined : NUM(v)) },
      { air: "Ceiling_Height", from: "ceilingHeight", to: S },
      { air: "Finishes", from: "finishes", to: S },
      { air: "Notes", from: "notes", to: S },
    ],
  },
  meeting_minutes: {
    table: "MEETING_MINUTES",
    specs: [
      { air: "Title", from: "title", to: (v) => S(v) || "Meeting" },
      { air: "Meeting_Date", from: "meetingDate", to: DATE },
      { air: "Attendees", from: "attendees", to: S },
      { air: "Raw_Minutes", from: "rawMinutes", to: S },
      { air: "Extracted_Actions", from: "extractedActions", to: S },
      { air: "Actions_Count", from: "actionsCount", to: (v) => NUM(v) },
      { air: "Status", from: "status", createDefault: "raw", to: S },
      { air: "Confirmed_At", from: "confirmedAt", to: DATE },
    ],
  },
  weekly_report: {
    table: "WEEKLY_REPORTS",
    specs: [
      { air: "Title", from: "title", to: (v) => S(v) || "Weekly report" },
      { air: "Week_Ending", from: "weekEnding", to: DATE },
      { air: "Content", from: "content", to: S },
      { air: "Is_AI_Generated", from: "isAiGenerated", to: BOOL },
      { air: "Status", from: "status", createDefault: "draft", to: S },
      { air: "Approved_By", from: "approvedBy", to: S },
      { air: "Approved_At", from: "approvedAt", to: DATE },
      { air: "Sent_At", from: "sentAt", to: DATE },
    ],
  },
  bim_model: {
    table: "BIM_MODELS",
    specs: [
      { air: "Name", from: "name", to: (v) => S(v) || "BIM model" },
      { air: "Provider", from: "provider", to: S },
      { air: "Embed_URL", from: "embedUrl", to: S },
      { air: "Client_Visible", from: "clientVisible", to: BOOL },
      { air: "Added_By", from: "addedBy", to: S },
      { air: "Notes", from: "notes", to: S },
      { air: "Job", from: "jobId", to: LINK },
    ],
  },
  quote: {
    table: "QUOTES",
    specs: [
      { air: "Title", from: "title", to: (v) => S(v) || "Untitled quote" },
      { air: "Ref_Number", from: "refNumber", to: S },
      { air: "Client_Name", from: "clientName", to: S },
      { air: "Status", from: "status", createDefault: "draft", to: S },
      { air: "GST_Rate", from: "gstRate", to: (v) => NUM(v, 10) },
      { air: "Subtotal", from: "subtotal", to: (v) => NUM(v) },
      { air: "GST_Amount", from: "gstAmount", to: (v) => NUM(v) },
      { air: "Total", from: "total", to: (v) => NUM(v) },
      { air: "Notes", from: "notes", to: S },
      { air: "Valid_Until", from: "validUntil", to: DATE },
    ],
  },
  quote_line: {
    table: "QUOTE_LINES",
    specs: [
      { air: "Description", from: "description", to: (v) => S(v) || "Line item" },
      { air: "Category", from: "category", to: S },
      { air: "Qty", from: "qty", to: (v) => NUM(v, 1) },
      { air: "Unit", from: "unit", to: S },
      { air: "Unit_Price", from: "unitPrice", to: (v) => NUM(v) },
      { air: "Line_Total", from: "lineTotal", to: (v) => NUM(v) },
      { air: "Sort_Order", from: "sortOrder", to: (v) => NUM(v) },
      { air: "Quote", from: "quoteId", to: LINK },
    ],
  },
};

/** Whether a writable table has an Airtable mapping (i.e. it migrates). */
export function airtableMapFor(table: string): AirtableMap | undefined {
  return FIELD_MAPS[table];
}
