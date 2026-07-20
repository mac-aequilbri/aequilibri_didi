// Weekly report ↔ DOCUMENTS mapping (Spec 12 reconciliation).
//
// Spec 12 dropped the legacy WEEKLY_REPORTS table; a weekly report is now stored
// as a DOCUMENTS row (Module 8 client-facing output): the markdown body lives in
// Text_Content, and the report's own lifecycle (week ending, draft→approved→sent,
// approver/sent stamps) rides in AI_Analysis under a `module8` block — kept out
// of Doc_Status so the generic DOCUMENTS status vocabulary stays clean. The
// Postgres backend still uses the rich plat_con_weeklyreport model; this module
// is the shared shape for the Airtable path (service + read sources).

/** Airtable Document_Type for a weekly report row. */
export const REPORT_DOC_TYPE = "Report"; // canonical Document_Type option (vocab §5.3)

/** Custom prompt-built report spec — stored with the report for audit and the
 *  Regenerate button (jobId rides here because DOCUMENTS has no job link). */
export interface ReportPromptSpec {
  prompt: string;
  scopes: string[];
  jobId: string;
}

export interface ReportModule8 {
  kind: "weekly_report";
  /** reportCatalog id; legacy rows have none and read as "weekly_progress". */
  reportId?: string;
  weekEnding: string;
  status: "draft" | "approved" | "sent";
  isAiGenerated: boolean;
  generatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  promptSpec?: ReportPromptSpec;
}

/** Serialize a report's lifecycle into the DOCUMENTS AI_Analysis cell. */
export function buildReportAnalysis(m8: ReportModule8): string {
  return JSON.stringify({ module8: m8 });
}

/** Recover the report lifecycle from a DOCUMENTS AI_Analysis cell, or null if the
 *  row is not a weekly report. Tolerant of malformed/legacy JSON. */
export function parseReportModule8(aiAnalysis: unknown): ReportModule8 | null {
  if (typeof aiAnalysis !== "string" || !aiAnalysis.trim()) return null;
  try {
    const parsed = JSON.parse(aiAnalysis) as { module8?: Partial<ReportModule8> };
    const m8 = parsed.module8;
    if (!m8 || m8.kind !== "weekly_report") return null;
    return {
      kind: "weekly_report",
      reportId: typeof m8.reportId === "string" ? m8.reportId : undefined,
      weekEnding: typeof m8.weekEnding === "string" ? m8.weekEnding : "",
      status: m8.status === "approved" || m8.status === "sent" ? m8.status : "draft",
      isAiGenerated: m8.isAiGenerated === true,
      generatedAt: typeof m8.generatedAt === "string" ? m8.generatedAt : "",
      approvedBy: typeof m8.approvedBy === "string" ? m8.approvedBy : undefined,
      approvedAt: typeof m8.approvedAt === "string" ? m8.approvedAt : undefined,
      sentAt: typeof m8.sentAt === "string" ? m8.sentAt : undefined,
      promptSpec:
        m8.promptSpec && typeof m8.promptSpec.prompt === "string"
          ? {
              prompt: m8.promptSpec.prompt,
              scopes: Array.isArray(m8.promptSpec.scopes) ? m8.promptSpec.scopes.map(String) : [],
              jobId: typeof m8.promptSpec.jobId === "string" ? m8.promptSpec.jobId : "",
            }
          : undefined,
    };
  } catch {
    return null;
  }
}

/** Merge lifecycle changes into an existing report's module8 and re-serialize. */
export function patchReportAnalysis(
  existing: unknown,
  patch: Partial<ReportModule8>,
): string {
  const base = parseReportModule8(existing) ?? {
    kind: "weekly_report" as const,
    weekEnding: "",
    status: "draft" as const,
    isAiGenerated: false,
    generatedAt: "",
  };
  return buildReportAnalysis({ ...base, ...patch });
}
