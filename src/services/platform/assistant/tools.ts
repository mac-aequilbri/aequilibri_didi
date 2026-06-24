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
}

export function roleCanUseTool(role: string, toolName: string): boolean {
  const normalized = normalizeTeamRole(role);
  const policy = TOOL_POLICY[toolName];
  if (!policy) return false;
  if (policy.risk === "read") return true;
  if (normalized === "owner" || normalized === "builder" || normalized === "architect") return true;
  return false;
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
];
