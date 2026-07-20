// Predefined report catalog — Phase 1 of docs/reporting-revamp-plan.md.
// v1 ships narrative (AI-drafted) reports in code; deterministic registers are
// Phase 2 and a control-base overlay (PLAT_REPORT_CATALOG) is Phase 4.

export type ReportScope = "phases" | "budget" | "cashflow" | "risks" | "actions" | "variations";

/** Slices that never serialize for a viewer without financial detail (CLS). */
export const FINANCE_SCOPES: readonly ReportScope[] = ["budget", "cashflow"];

export interface ReportDef {
  id: string;
  title: string;
  kind: "narrative";
  /** Job-context slices fed to the model (finance ones gated per viewer). */
  scopes: readonly ReportScope[];
  /** prompts.ts key holding the pinned system prompt. */
  promptKey: string;
  /** Label for the period date param, also prefixed to the user message. */
  periodLabel: string;
  /** Force the weekly Progress/Budget/Risks/Next-week section skeleton. */
  sectionTemplate?: boolean;
}

export const REPORT_CATALOG: readonly ReportDef[] = [
  {
    id: "weekly_progress",
    title: "Weekly Progress Report",
    kind: "narrative",
    scopes: ["phases", "budget", "cashflow", "risks", "actions", "variations"],
    promptKey: "reports.weekly",
    periodLabel: "Week ending",
    sectionTemplate: true,
  },
  {
    id: "monthly_client_summary",
    title: "Monthly Client Summary",
    kind: "narrative",
    scopes: ["phases", "budget", "risks", "variations"],
    promptKey: "reports.monthly_client",
    periodLabel: "Month ending",
  },
  {
    id: "project_health",
    title: "Project Health Snapshot",
    kind: "narrative",
    scopes: ["phases", "budget", "cashflow", "risks", "actions", "variations"],
    promptKey: "reports.project_health",
    periodLabel: "As at",
  },
];

export function reportDef(id: string): ReportDef | undefined {
  return REPORT_CATALOG.find((d) => d.id === id);
}
