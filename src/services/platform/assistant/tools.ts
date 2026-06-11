// Assistant tool definitions — the "save this" mechanism from the Platform
// Architecture doc. Each write tool maps to a fixed recordWriter table (the
// model never names tables) with a risk class that the org's aiAuthority
// policy uses to decide execute-now vs propose-for-approval.

import type Anthropic from "@anthropic-ai/sdk";
import type { WritableTable } from "@/lib/platform/recordWriter";

export interface ToolPolicy {
  table?: WritableTable;
  op?: "create" | "update";
  risk: "read" | "low_write" | "high_write";
}

export const TOOL_POLICY: Record<string, ToolPolicy> = {
  query_records: { risk: "read" },
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
    type: "number" as const,
    description: "Job id the record belongs to (from context or query_records).",
  },
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
          ],
        },
        jobId: { type: "number", description: "Optional job id filter." },
        status: { type: "string", description: "Optional status filter." },
        limit: { type: "number", description: "Max rows (default 20)." },
      },
      required: ["table"],
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
        recordId: { type: "number", description: "Action id." },
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
        recordId: { type: "number", description: "Budget line id (from query_records)." },
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
        recordId: { type: "number", description: "Workstream id." },
        status: { type: "string" },
        notes: { type: "string" },
        milestone: { type: "string" },
      },
      required: ["recordId"],
    },
  },
];
