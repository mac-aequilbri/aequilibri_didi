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

const DOC_WORKSTREAM_LINK = (data: Record<string, unknown>): string[] | undefined => {
  const raw = typeof data.aiAnalysis === "string" ? data.aiAnalysis : "";
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { module4?: { traceability?: { workstreamId?: unknown } } };
    return LINK(parsed.module4?.traceability?.workstreamId);
  } catch {
    return undefined;
  }
};

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
const COMMS_STATUS: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  acknowledged: "Acknowledged",
  overdue: "Overdue",
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
    table: "ISSUES",
    specs: [
      { air: "Action_Name", from: "title", to: (v) => S(v).slice(0, 200) || "Untitled action" },
      { air: "Description", from: "detail", to: S, createDefault: "" },
      { air: "Status", from: "status", createDefault: "open", to: (v) => ACTION_STATUS[S(v)] ?? "Open" },
      { air: "Priority", from: "priority", createDefault: "P2", to: (v) => ACTION_PRIORITY[S(v)] ?? "Medium" },
      // Spec 12 ISSUES fields (typecast creates the option; links no-op on non-rec ids).
      // Real ISSUES has no Phase field, and its risk link is named RISKS (not Linked_Risk).
      { air: "Issue_Type", from: "issueType", createDefault: "Open Action", to: S },
      { air: "RISKS", from: "riskId", to: LINK },
      { air: "Due_Date", from: "dueDate", to: DATE },
      { air: "Notes", from: "owner", to: (v) => (v ? `Owner: ${S(v)}` : undefined) },
    ],
  },
  comms: {
    // COMMS (Spec 10 Core) — the coordination layer. Presence-driven like the
    // others; links no-op on non-rec ids. Status maps app→Airtable option names.
    table: "COMMS",
    specs: [
      { air: "Topic", from: "topic", to: (v) => S(v).slice(0, 300) || "Communication" },
      { air: "Message_Type", from: "messageType", to: S },
      { air: "Stakeholder_Role", from: "stakeholderRole", to: S },
      { air: "Status", from: "status", createDefault: "pending", to: (v) => COMMS_STATUS[S(v)] ?? "Pending" },
      { air: "Due_Date", from: "dueDate", to: DATE },
      { air: "Sent_By", from: "sentBy", to: S },
      { air: "Notes", from: "notes", to: S },
      { air: "Job", from: "jobId", to: LINK },
      { air: "Stakeholder", from: "stakeholderId", to: LINK },
      { air: "Phase", from: "phaseId", to: LINK },
      { air: "Linked_Issue", from: "linkedIssueId", to: LINK },
      { air: "Linked_Decision", from: "linkedDecisionId", to: LINK },
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
      // Direct Job link (added by airtable-add-decision-job-link.mjs); the
      // canonical schema hangs decisions off WORKSTREAMS/ACTION_HUB, but the app
      // associates them with a job. LINK no-ops on a non-rec id (Postgres mode).
      { air: "Job", from: "jobId", to: LINK },
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
  assessment: {
    // P3 — the intake draft. The rich StoredAssessment rides in Result as JSON
    // (same as the Postgres `result` column); the scalars are for display/filter.
    // Job links on acceptance (LINK no-ops for a non-rec id).
    table: "ASSESSMENTS",
    specs: [
      { air: "Assessment_Name", from: "name", to: (v) => S(v) || "Assessment" },
      { air: "Engagement_Type", from: "engagementType", to: S },
      { air: "Address", from: "address", to: S },
      { air: "Suburb", from: "suburb", to: S },
      { air: "Size_Sqm", from: "sizeSqm", to: (v) => (v == null || v === "" ? undefined : NUM(v)) },
      { air: "Scope", from: "scope", to: S },
      { air: "Result", from: "result", to: S },
      { air: "Status", from: "status", createDefault: "draft", to: S },
      { air: "Prompt_Version", from: "promptVersion", to: S },
      { air: "Created_By", from: "createdBy", to: S },
      { air: "Job", from: "jobId", to: LINK },
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
      { air: "Upload_Date", createOnly: true, to: () => new Date().toISOString() },
      { air: "Drive_URL", from: "storageRef", to: S },
      { air: "Doc_Status", from: "status", to: S },
      { air: "Uploaded_By", from: "uploadedBy", to: S },
      { air: "Storage_Provider", from: "storageProvider", to: S },
      { air: "Text_Content", from: "textContent", to: S },
      { air: "AI_Summary", from: "aiSummary", to: S },
      { air: "AI_Analysis", from: "aiAnalysis", to: S },
      { air: "Confidence", from: "confidence", to: (v) => (v == null || v === "" ? undefined : NUM(v)) },
      { air: "Analyzed_At", from: "analyzedAt", to: DATE },
      { air: "Job", from: "jobId", to: LINK },
      { air: "Related_Workstream", to: (_v, data) => DOC_WORKSTREAM_LINK(data) },
    ],
  },
  learning_rule: {
    // Reconciled with the canonical Airtable LEARNING_RULES schema so the engine
    // (getActiveRules/applyRules) and the learning-rules page read what this
    // writes. typecast:true on the client auto-creates the single-select options
    // (Rule_Type/Rule_Status/Applies_To). Every spec is presence-driven (no
    // derived field), so a partial update (e.g. a status toggle) never clobbers
    // unrelated fields. ruleCode/kind/isActive/autoApply round-trip; the
    // adjustment JSON rides in Operational_Directive (dimension is recovered
    // from it on read).
    table: "LEARNING_RULES",
    specs: [
      { air: "Instance", from: "ruleCode", to: S },
      { air: "Rule_Name", from: "description", to: (v) => S(v).slice(0, 120) || "Untitled rule" },
      { air: "Rule_Description", from: "description", to: S },
      { air: "Rule_Type", from: "kind", to: (v) => S(v) || "guidance" },
      { air: "Rule_Status", from: "isActive", createDefault: true, to: (v) => (BOOL(v) ? "Published" : "Draft") },
      { air: "Applies_To", from: "autoApply", to: (v) => (BOOL(v) ? "AI Layer Only" : "Owner Review") },
      { air: "Trigger_Context", from: "triggerCondition", to: S },
      { air: "Operational_Directive", from: "adjustment", to: S },
      { air: "Priority", from: "priority", to: (v) => NUM(v) },
      { air: "Confidence_Level", from: "confidence", to: (v) => NUM(v, 50) },
      { air: "Times_Triggered", from: "timesTriggered", to: (v) => NUM(v) },
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
    // Spec 12 PROCUREMENT. Total_Cost is an Airtable formula (Quantity ×
    // Unit_Cost) — never written. Supplier + Budget_Category are links; the
    // text `category`/`vendorName` payload keys have no home here and are
    // dropped (wiring those links from the form is out of scope).
    specs: [
      { air: "Procurement_Name", from: "item", to: (v) => S(v).slice(0, 300) || "Untitled item" },
      { air: "Quantity", from: "qty", to: (v) => NUM(v, 1) },
      { air: "Unit_Cost", from: "unitPrice", to: (v) => NUM(v) },
      { air: "Status", from: "status", createDefault: "Ordered", to: S },
      { air: "Expected_Date", from: "dueDate", to: DATE },
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
    // Spec 12 BUDGET. Actual is an Airtable rollup (computed from PROCUREMENT) —
    // never written. Committed has no Spec 12 field. Variance is derived in the
    // read layer (Forecast − Estimated), so it isn't written either.
    specs: [
      { air: "Budget_Category", from: "category", to: (v) => S(v) || "Budget line" },
      { air: "Estimated", from: "budgetAmount", to: (v) => NUM(v) },
      { air: "Forecast", from: "forecast", to: (v) => NUM(v) },
      { air: "RAG", from: "rag", to: S },
      { air: "Notes", from: "description", to: S },
      { air: "Job", from: "jobId", to: LINK },
    ],
  },
  cashflow: {
    table: "CASHFLOWS",
    // Spec 12 per-transaction ledger.
    specs: [
      { air: "Cashflow_Name", from: "name", to: (v) => S(v) || "Cashflow entry" },
      { air: "Period", from: "period", to: S },
      { air: "Type", from: "type", createDefault: "Out", to: (v) => (S(v) === "In" ? "In" : "Out") },
      { air: "Amount", from: "amount", to: (v) => NUM(v) },
      { air: "Source_Or_Payee", from: "sourceOrPayee", to: S },
      { air: "Category", from: "category", to: S },
      { air: "Status", from: "status", createDefault: "Forecast", to: S },
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
      { air: "Job", from: "jobId", to: LINK },
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
      { air: "Job", from: "jobId", to: LINK },
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
      { air: "Job", from: "jobId", to: LINK },
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
      { air: "Job", from: "jobId", to: LINK },
      // A proposal links to its source assessment before any Job exists; Job is
      // backfilled on acceptance. See generateProposalFromAssessment.
      { air: "Assessment", from: "assessmentId", to: LINK },
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
