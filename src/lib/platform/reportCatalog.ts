// Predefined report catalog — Phase 1 of the reporting revamp (all phases
// shipped 2026-07-20; see MASTER_IMPLEMENTATION_GUIDE.md, ADR-13).
// v1 ships narrative (AI-drafted) reports in code; deterministic registers are
// Phase 2 and a control-base overlay (PLAT_REPORT_CATALOG) is Phase 4.

export type ReportScope = "phases" | "budget" | "cashflow" | "risks" | "actions" | "variations";

export const ALL_SCOPES: readonly ReportScope[] = [
  "phases",
  "budget",
  "cashflow",
  "risks",
  "actions",
  "variations",
];

/** Slices that never serialize for a viewer without financial detail (CLS). */
export const FINANCE_SCOPES: readonly ReportScope[] = ["budget", "cashflow"];

export interface ReportDef {
  id: string;
  title: string;
  /** One-line plain-English summary: what the report contains, who it's for. */
  description: string;
  /** narrative = AI-drafted; deterministic = rendered from data, no AI call. */
  kind: "narrative" | "deterministic";
  /** Job-context slices fed to the model (finance ones gated per viewer). */
  scopes: readonly ReportScope[];
  /** prompts.ts key holding the pinned system prompt (narrative only). */
  promptKey?: string;
  /** Label for the period date param, also prefixed to the user message. */
  periodLabel: string;
  /** Force the weekly Progress/Budget/Risks/Next-week section skeleton. */
  sectionTemplate?: boolean;
  /** Entirely finance-gated: hidden from and refused for non-finance viewers. */
  financeOnly?: boolean;
  /** Deterministic only: prepend a short AI executive-summary paragraph. */
  aiSummary?: boolean;
}

export const REPORT_CATALOG: readonly ReportDef[] = [
  {
    id: "weekly_progress",
    title: "Weekly Progress Report",
    description:
      "The regular weekly update across progress, budget, risks and next steps — for the project team and client.",
    kind: "narrative",
    scopes: ["phases", "budget", "cashflow", "risks", "actions", "variations"],
    promptKey: "reports.weekly",
    periodLabel: "Week ending",
    sectionTemplate: true,
  },
  {
    id: "monthly_client_summary",
    title: "Monthly Client Summary",
    description:
      "A polished month-in-review for the client: milestones reached, budget position, key risks and approved variations.",
    kind: "narrative",
    scopes: ["phases", "budget", "risks", "variations"],
    promptKey: "reports.monthly_client",
    periodLabel: "Month ending",
  },
  {
    id: "project_health",
    title: "Project Health Snapshot",
    description:
      "A point-in-time health check across schedule, money, risks and open items — a quick internal read on where the job stands.",
    kind: "narrative",
    scopes: ["phases", "budget", "cashflow", "risks", "actions", "variations"],
    promptKey: "reports.project_health",
    periodLabel: "As at",
  },
  {
    id: "budget_variance",
    title: "Budget vs Actuals",
    description:
      "Line-by-line budget against actual spend with variances, plus a short AI summary — for whoever owns the numbers.",
    kind: "deterministic",
    scopes: ["budget"],
    periodLabel: "As at",
    financeOnly: true,
    aiSummary: true,
  },
  {
    id: "cashflow_forecast",
    title: "Cashflow Forecast",
    description:
      "Expected cash in and out over coming periods, including variation impacts, with an AI summary — for financial planning.",
    kind: "deterministic",
    scopes: ["cashflow", "variations"],
    periodLabel: "As at",
    financeOnly: true,
    aiSummary: true,
  },
  {
    id: "risk_register",
    title: "Risk Register",
    description:
      "Every open risk in one clean table with rating, mitigation and owner — the current register, ready to circulate.",
    kind: "deterministic",
    scopes: ["risks"],
    periodLabel: "As at",
  },
  {
    id: "variations_register",
    title: "Variations / Change Orders",
    description:
      "All variations and change orders with status and value — the paper trail for scope and cost changes on the job.",
    kind: "deterministic",
    scopes: ["variations"],
    periodLabel: "As at",
  },
  {
    id: "actions_status",
    title: "Open Actions & Overdue",
    description:
      "Every open action item with owner and due date, flagging what's overdue — the checklist for the weekly stand-up.",
    kind: "deterministic",
    scopes: ["actions"],
    periodLabel: "As at",
  },
  {
    id: "phase_schedule",
    title: "Phase / Schedule Status",
    description:
      "Phase-by-phase progress against planned dates — shows where the job is tracking ahead or falling behind schedule.",
    kind: "deterministic",
    scopes: ["phases"],
    periodLabel: "As at",
  },
];

export function reportDef(id: string): ReportDef | undefined {
  return REPORT_CATALOG.find((d) => d.id === id);
}
