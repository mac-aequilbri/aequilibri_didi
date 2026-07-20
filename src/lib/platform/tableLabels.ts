/**
 * Friendly display names for platform tables.
 *
 * Raw table identifiers show up in the UI from two vocabularies:
 *  - physical table names recorded in the execution log, e.g. "plat_con_budgetline"
 *    (plus the Airtable-only specials "CASHFLOWS" / "COMMS"), and
 *  - logical write-registry keys used by proposals, e.g. "budget_line".
 *
 * `friendlyTableLabel` accepts either form and returns a plain-English noun
 * suitable for user-facing copy ("update budget line", "3 variations", ...).
 */

const LABELS: Record<string, string> = {
  // Core
  job: "project",
  contact: "contact",
  workstream: "workstream",
  action: "action",
  actionhub: "action",
  action_hub: "action",
  decision: "decision",
  learningrule: "learning rule",
  learning_rule: "learning rule",
  document: "document",
  doc_registry: "document",
  docregistry: "document",
  organisation: "organisation",
  assessment: "assessment",
  correction: "correction",
  chatmessage: "chat message",
  chat_message: "chat message",
  pendingwrite: "proposal",
  pending_write: "proposal",
  teammember: "team member",
  team_member: "team member",
  comms: "communication",
  commslog: "communication",
  comms_log: "communication",
  // Construction
  phase: "phase",
  phaseevidence: "phase evidence",
  phase_evidence: "phase evidence",
  budgetline: "budget line",
  budget_line: "budget line",
  cashflow: "cashflow entry",
  cashflows: "cashflow entry",
  risk: "risk",
  variationorder: "variation",
  variation_order: "variation",
  vendor: "vendor",
  procurement: "procurement item",
  room: "room",
  roommatrix: "room",
  room_matrix: "room",
  meetingminutes: "meeting minutes",
  meeting_minutes: "meeting minutes",
  weeklyreport: "weekly report",
  weekly_report: "weekly report",
  bimmodel: "BIM model",
  bim_model: "BIM model",
  portaltoken: "portal link",
  portal_token: "portal link",
  quote: "quote",
  quoteline: "quote line",
  quote_line: "quote line",
  accountingconnection: "accounting connection",
  accounting_connection: "accounting connection",
};

/** Turn a raw table identifier into a plain-English noun for the UI. */
export function friendlyTableLabel(raw: string): string {
  const key = raw.toLowerCase().replace(/^plat_(core|con|cfg)_/, "");
  return LABELS[key] ?? key.replace(/_/g, " ");
}
