// Canonical controlled vocabularies (governance framework §5.3) and the
// write-time force-to-review control (§5.2 rule 3): any outbound value for a
// governed field that isn't canonical is replaced with the field's
// review-default — never guessed, never allowed to auto-create a select
// option. Case-only variants normalize to canonical casing (the register
// treats those as HIGH-confidence, e.g. "create" → "Create").
//
// Enforced at the single Airtable write choke point (recordWriter.performWrite,
// post-toFields), so human forms, AI tools, ingestion, and approved proposals
// all carry the same governance. Keys are `${AIRTABLE_TABLE}.${Field}`.
//
// Not yet governed here: RISKS/TEAM/COMMS/CORRECTIONS statuses (§5.4
// "empty–defined" — sets not enumerated in the framework doc), and
// WORKSTREAMS/ASSESSMENTS/QUOTES/report tables (outside the §5.4 register).

interface VocabRule {
  canonical: readonly string[];
  reviewDefault: string;
}

export const VOCAB: Record<string, VocabRule> = {
  "ISSUES.Status": {
    canonical: ["Open", "In Progress", "Blocked", "Deferred", "Closed"],
    reviewDefault: "Open",
  },
  "ISSUES.Priority": {
    canonical: ["Critical", "High", "Medium", "Low"],
    reviewDefault: "Medium",
  },
  "ISSUES.Issue_Type": {
    canonical: ["Open Action", "Blocker", "Decision Required", "Scope Change Trigger", "Risk Materialised"],
    reviewDefault: "Open Action",
  },
  "DECISIONS.Status": {
    canonical: ["Pending", "Approved", "Reversed"],
    reviewDefault: "Pending",
  },
  "PROCUREMENT.Status": {
    canonical: ["Selection Required", "Selected", "Quoted", "Invoiced", "Paid", "Delivered", "Cancelled"],
    reviewDefault: "Selection Required",
  },
  "CASHFLOWS.Type": { canonical: ["In", "Out"], reviewDefault: "Out" },
  "CASHFLOWS.Status": {
    canonical: ["Scheduled", "Confirmed", "Paid", "Overdue"],
    reviewDefault: "Scheduled",
  },
  // "Pending" and "Variation" extend the doc's §5.3 sets pending a D1 amendment:
  // Spec 12 stores variation orders in CHANGE_LOG (Change_Type="Variation") and
  // uses Status="Pending" for submitted-awaiting-approval — rewriting either
  // would break the app's own round-trip. Flagged in the Phase 0 register.
  "CHANGE_LOG.Status": {
    canonical: ["Proposed", "Pending", "Approved", "Rejected", "Implemented"],
    reviewDefault: "Proposed",
  },
  "CHANGE_LOG.Change_Type": {
    canonical: ["Schedule", "Specification", "Selection", "Scope", "Procurement", "Budget", "Cost", "Variation"],
    reviewDefault: "Variation",
  },
  "PLAN.Status": {
    canonical: ["Not Started", "In Progress", "Complete", "Blocked", "Deferred"],
    reviewDefault: "Not Started",
  },
  "PHASES.Status": {
    canonical: ["Not Started", "In Progress", "Complete"],
    reviewDefault: "Not Started",
  },
  "JOBS.Status": {
    canonical: ["Open", "In Progress", "Closed"],
    reviewDefault: "Open",
  },
  "LEARNING_RULES.Rule_Status": {
    canonical: ["Draft", "Published", "Retired"],
    reviewDefault: "Draft",
  },
  "EXECUTION_LOG.Status": {
    canonical: ["Not Started", "Ongoing", "Done", "Blocked"],
    reviewDefault: "Ongoing",
  },
  "EXECUTION_LOG.Action_Type": {
    canonical: ["Create", "Update", "Delete", "Propose", "Promote", "Chat"],
    reviewDefault: "Update",
  },
  "DOCUMENTS.Document_Type": {
    canonical: ["Plan", "Report", "Legal", "Reference", "Form", "Template", "Contract", "Warranty", "Invoice", "Correspondence", "Other"],
    reviewDefault: "Other",
  },
  "DOCUMENTS.Doc_Status": {
    canonical: ["Active", "Superseded", "Archived"],
    reviewDefault: "Active",
  },
  "HYPOTHESES.Status": {
    canonical: ["Proposed", "Validated", "Rejected"],
    reviewDefault: "Proposed",
  },
};

export interface VocabCoercion {
  field: string;
  from: string;
  to: string;
}

/** Force-to-review, in place: replace each governed field's non-canonical
 *  string with canonical casing (case-only variant) or the review-default.
 *  Returns what changed so the caller can surface it. Empty/non-string cells
 *  pass through — presence is the field map's concern, not vocabulary's. */
export function enforceVocab(
  table: string,
  fields: Record<string, unknown>,
): VocabCoercion[] {
  const coercions: VocabCoercion[] = [];
  for (const [key, cell] of Object.entries(fields)) {
    const rule = VOCAB[`${table}.${key}`];
    if (!rule || typeof cell !== "string" || cell === "") continue;
    if (rule.canonical.includes(cell)) continue;
    const ci = rule.canonical.find((c) => c.toLowerCase() === cell.trim().toLowerCase());
    const to = ci ?? rule.reviewDefault;
    fields[key] = to;
    coercions.push({ field: key, from: cell, to });
  }
  return coercions;
}
