// Assistant tool definitions — the "save this" mechanism from the Platform
// Architecture doc. Each write tool maps to a fixed recordWriter table (the
// model never names tables) with a risk class that the org's aiAuthority
// policy uses to decide execute-now vs propose-for-approval.

import type Anthropic from "@anthropic-ai/sdk";
import type { WritableTable } from "@/lib/platform/recordWriter";
import { normalizeTeamRole } from "@/lib/platform/module1Governance";

export interface ToolPolicy {
  table?: WritableTable;
  op?: "create" | "update";
  risk: "read" | "low_write" | "high_write";
  /** "record" (default) → routed through recordWriter under the aiAuthority
   *  gate. "service" → dispatched to a platform service that produces a
   *  human-reviewable draft/suggestion (report, assessment, route hints); the
   *  downstream lifecycle step (approve/materialise) is the human gate. */
  kind?: "record" | "service";
}

// Spec 12 role-scoped write access (Module 7): Owner confirms anything;
// Builder writes to PLAN and ISSUES only (no budget, no risks, no decisions);
// Architect additionally drafts scope changes (variation orders = CHANGE_LOG)
// but has no financial write; Broker is read-only except creating ISSUES
// (Decision Required flagging). All writes remain approval-gated downstream.
const ROLE_WRITE_ALLOW: Record<string, ReadonlySet<string>> = {
  builder: new Set([
    "create_action",
    "update_action",
    "log_workstream_update",
    "capture_source_note",
    "generate_weekly_report",
  ]),
  architect: new Set([
    "create_action",
    "update_action",
    "log_workstream_update",
    "capture_source_note",
    "create_variation_draft",
    "generate_weekly_report",
  ]),
  broker: new Set(["create_action"]),
};

export function roleCanUseTool(
  role: string,
  toolName: string,
  policyMap: Record<string, ToolPolicy> = TOOL_POLICY,
): boolean {
  const normalized = normalizeTeamRole(role);
  const policy = policyMap[toolName];
  if (!policy) return false;
  if (policy.risk === "read") return true;
  if (normalized === "owner") return true;
  return ROLE_WRITE_ALLOW[normalized]?.has(toolName) ?? false;
}

// Spec 12 role-scoped read access: financial tables (BUDGET/CASHFLOWS) are
// Owner-only; RISKS is hidden from Builder/Architect; LEARNING_RULES from all
// non-owner roles; PROCUREMENT is financial detail the Architect doesn't get.
const ROLE_QUERY_DENY: Record<string, ReadonlySet<string>> = {
  builder: new Set(["budget_lines", "cashflows", "risks", "learning_rules"]),
  architect: new Set(["budget_lines", "cashflows", "procurement", "risks", "learning_rules"]),
  broker: new Set(["budget_lines", "cashflows", "learning_rules"]),
};

export function roleCanQueryTable(role: string, table: string): boolean {
  const normalized = normalizeTeamRole(role);
  if (normalized === "owner") return true;
  return !(ROLE_QUERY_DENY[normalized]?.has(table) ?? false);
}

export const TOOL_POLICY: Record<string, ToolPolicy> = {
  query_records: { risk: "read" },
  capture_source_note: { table: "document", op: "create", risk: "low_write" },
  create_action: { table: "action", op: "create", risk: "low_write" },
  update_action: { table: "action", op: "update", risk: "low_write" },
  save_decision: { table: "decision", op: "create", risk: "low_write" },
  propose_rule: { table: "learning_rule", op: "create", risk: "high_write" },
  update_budget_line: { table: "budget_line", op: "update", risk: "high_write" },
  create_variation_draft: { table: "variation_order", op: "create", risk: "high_write" },
  create_risk: { table: "risk", op: "create", risk: "low_write" },
  log_workstream_update: { table: "workstream", op: "update", risk: "low_write" },
  generate_weekly_report: { risk: "low_write", kind: "service" },
  run_construction_intake: { risk: "low_write", kind: "service" },
  suggest_ingestion_routes: { risk: "read", kind: "service" },
  onboarding_status: { risk: "read", kind: "service" },
};

const jobIdProp = {
  jobId: {
    oneOf: [{ type: "number" as const }, { type: "string" as const }],
    description: 'Job id the record belongs to (numeric in Postgres, "rec..." in Airtable).',
  },
};

const recordIdProp = {
  oneOf: [{ type: "number" as const }, { type: "string" as const }],
};

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "query_records",
    description:
      "Read project data. Returns matching rows as JSON. Use before proposing changes so values are grounded in the database.",
    input_schema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          enum: [
            "jobs",
            "actions",
            "decisions",
            "phases",
            "budget_lines",
            "cashflows",
            "risks",
            "variations",
            "procurement",
            "vendors",
            "learning_rules",
            "documents",
          ],
        },
        jobId: { ...jobIdProp.jobId, description: "Optional job id filter." },
        status: { type: "string", description: "Optional status filter." },
        limit: { type: "number", description: "Max rows (default 20)." },
      },
      required: ["table"],
    },
  },
  {
    name: "capture_source_note",
    description:
      "Capture important source material from the conversation as a persistent document/note so it can be traced later.",
    input_schema: {
      type: "object",
      properties: {
        ...jobIdProp,
        title: { type: "string" },
        note: { type: "string", description: "The substantive note or source content to preserve." },
      },
      required: ["note"],
    },
  },
  {
    name: "create_action",
    description: "Create an action item in the Action Hub.",
    input_schema: {
      type: "object",
      properties: {
        ...jobIdProp,
        title: { type: "string" },
        detail: { type: "string" },
        priority: { type: "string", enum: ["P1", "P2", "P3"] },
        owner: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_action",
    description: "Update an existing action item (status, owner, due date…).",
    input_schema: {
      type: "object",
      properties: {
        recordId: { ...recordIdProp, description: "Action id." },
        status: { type: "string", enum: ["open", "in_progress", "done", "deferred"] },
        owner: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        detail: { type: "string" },
      },
      required: ["recordId"],
    },
  },
  {
    name: "save_decision",
    description:
      "Record a project decision discussed in this conversation so it persists beyond the session.",
    input_schema: {
      type: "object",
      properties: {
        ...jobIdProp,
        description: { type: "string" },
        rationale: { type: "string" },
        category: { type: "string" },
        status: { type: "string", enum: ["proposed", "confirmed"] },
      },
      required: ["description"],
    },
  },
  {
    name: "propose_rule",
    description:
      "Propose a new learning rule (guidance the assistant must follow in future sessions). Always requires human approval.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string" },
        category: { type: "string" },
      },
      required: ["description"],
    },
  },
  {
    name: "update_budget_line",
    description: "Update a budget line's amounts (budget, committed or actual).",
    input_schema: {
      type: "object",
      properties: {
        recordId: { ...recordIdProp, description: "Budget line id (from query_records)." },
        budgetAmount: { type: "number" },
        committedAmount: { type: "number" },
        actualAmount: { type: "number" },
      },
      required: ["recordId"],
    },
  },
  {
    name: "create_variation_draft",
    description: "Draft a variation order for human review.",
    input_schema: {
      type: "object",
      properties: {
        ...jobIdProp,
        title: { type: "string" },
        description: { type: "string" },
        scopeChange: { type: "string" },
        costImpact: { type: "number" },
        timeImpactDays: { type: "number" },
      },
      required: ["jobId", "title"],
    },
  },
  {
    name: "create_risk",
    description: "Add a risk to the register.",
    input_schema: {
      type: "object",
      properties: {
        ...jobIdProp,
        description: { type: "string" },
        likelihood: { type: "number", description: "1–5" },
        impact: { type: "number", description: "1–5" },
        mitigation: { type: "string" },
        owner: { type: "string" },
      },
      required: ["jobId", "description"],
    },
  },
  {
    name: "log_workstream_update",
    description: "Update a workstream's status/notes at session close.",
    input_schema: {
      type: "object",
      properties: {
        recordId: { ...recordIdProp, description: "Workstream id." },
        status: { type: "string" },
        notes: { type: "string" },
        milestone: { type: "string" },
      },
      required: ["recordId"],
    },
  },
  {
    name: "generate_weekly_report",
    description:
      "Generate a draft weekly client report for a job from its live data (progress, budget, risks, next week). Creates a draft that a human approves before it is sent.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { ...jobIdProp.jobId, description: "Job to report on." },
        weekEnding: { type: "string", description: "Week-ending date, YYYY-MM-DD." },
      },
      required: ["jobId", "weekEnding"],
    },
  },
  {
    name: "run_construction_intake",
    description:
      "Run a construction intake assessment (Assessment Engine): from scope, address and size it drafts a budget, phase plan and risks for human review before a job is created. Produces a draft assessment, not a job.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Prospective job name." },
        scope: { type: "string", description: "Scope of work." },
        address: { type: "string" },
        suburb: { type: "string" },
        engagementType: {
          type: "string",
          enum: ["short_job", "long_project", "ongoing", "seasonal"],
        },
        sizeSqm: { type: "number" },
        category: { type: "string", description: "Optional job-category catalog key." },
      },
      required: ["name", "scope"],
    },
  },
  {
    name: "suggest_ingestion_routes",
    description:
      "Given raw source text (e.g. an email or document body) and its classification, suggest how it should be routed into the system (cashflow, procurement, decision or action). Read-only — returns suggestions, writes nothing.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The source text to analyse." },
        classification: {
          type: "string",
          enum: ["invoice", "quote", "contract", "specification", "report", "correspondence", "other"],
        },
        jobId: { ...jobIdProp.jobId, description: "Optional job the source relates to." },
        title: { type: "string", description: "Optional source title." },
      },
      required: ["text", "classification"],
    },
  },
  {
    name: "onboarding_status",
    description:
      "Report the current organisation's Day-1 configuration readiness: enabled/disabled features, engagement types, AI write authority, assistant setup, branding and governance. Read-only; platform-admin only.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

// Per-agent tool bundles are built by name from the shared definitions above,
// so the tool schema + policy stay single-sourced (and the full-union exports
// ASSISTANT_TOOLS / TOOL_POLICY remain intact for the policy tests).

/** An agent's tool subset, selected by tool name. */
export function toolsByName(names: readonly string[]): Anthropic.Tool[] {
  return ASSISTANT_TOOLS.filter((t) => names.includes(t.name));
}

/** An agent's policy subset (only the named tools that have a policy). */
export function policyByName(names: readonly string[]): Record<string, ToolPolicy> {
  const out: Record<string, ToolPolicy> = {};
  for (const n of names) if (TOOL_POLICY[n]) out[n] = TOOL_POLICY[n];
  return out;
}
