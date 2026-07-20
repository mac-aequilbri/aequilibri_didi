// Weekly reports — AI-generated from live job data, human approval before
// sending (doc module 8: client-facing outputs).
//
// Storage model differs by backend. Postgres keeps the rich plat_con_weeklyreport
// model (+ an immutable DOCUMENTS snapshot). Airtable (Spec 12) has no
// WEEKLY_REPORTS table, so a report IS a DOCUMENTS row: the markdown body in
// Text_Content, the lifecycle (week ending, draft→approved→sent) in AI_Analysis
// under a module8 block (see reportDoc.ts). Both paths go through writeRecord, so
// the audit log + approval discipline are unchanged.

import { airtableEnabled, core } from "@/lib/airtable";
import { callClaude } from "@/lib/claude";
import { loadJobContext } from "@/lib/platform/jobContextSource";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { emitOutboundEvent } from "@/lib/platform/outbox";
import { FINANCE_SCOPES, reportDef, type ReportScope } from "@/lib/platform/reportCatalog";
import {
  buildReportAnalysis,
  parseReportModule8,
  patchReportAnalysis,
  REPORT_DOC_TYPE,
} from "@/lib/platform/reportDoc";
import { writeRecord, type RecordId } from "@/lib/platform/recordWriter";
import { getStorer } from "@/lib/platform/storage";
import { OrgCtx } from "@/lib/platform/types";
import { generateManagedDocument } from "@/services/platform/documents";

function applyWeeklyTemplate(content: string): string {
  const text = content.trim();
  const blocks: string[] = [];
  const add = (heading: string, fallback: string) => {
    if (text.includes(heading)) return;
    blocks.push(heading, fallback, "");
  };
  if (!text) {
    return [
      "## Progress",
      "_No progress summary provided._",
      "",
      "## Budget",
      "_Budget summary pending._",
      "",
      "## Risks",
      "_No risks reported._",
      "",
      "## Next week",
      "_Next-week plan pending._",
    ].join("\n");
  }
  add("## Progress", text);
  add("## Budget", "_Budget summary pending._");
  add("## Risks", "_No risks reported._");
  add("## Next week", "_Next-week plan pending._");
  return blocks.length ? `${text}\n\n${blocks.join("\n").trim()}` : text;
}

type JobContext = NonNullable<Awaited<ReturnType<typeof loadJobContext>>>;

/** Serialize only the requested job-context slices (CLS: finance slices are
 *  filtered out before this is called). Keys match the legacy weekly context. */
function buildReportContext(job: JobContext, scopes: readonly ReportScope[]): string {
  const slices: Record<ReportScope, () => [string, unknown]> = {
    phases: () => [
      "phases",
      job.phases.map((p) => ({ name: p.name, status: p.status, pct: p.completionPct })),
    ],
    risks: () => [
      "openRisks",
      job.risks.map((r) => ({ desc: r.description, score: r.likelihood * r.impact })),
    ],
    budget: () => [
      "budget",
      job.budget.map((b) => ({ category: b.category, budget: b.budgetAmount, actual: b.actualAmount })),
    ],
    cashflow: () => [
      "cashflow",
      job.cashflow.map((c) => ({ period: c.period, projected: c.projected, actual: c.actual })),
    ],
    actions: () => [
      "openActions",
      job.actions.map((a) => ({ title: a.title, owner: a.owner, due: a.dueDate })),
    ],
    variations: () => [
      "variations",
      job.variations.map((v) => ({ ref: v.refNumber, title: v.title, cost: v.costImpact, status: v.status })),
    ],
  };
  const out: Record<string, unknown> = {
    job: { name: job.name, completionPct: job.completionPct, healthScore: job.healthScore },
  };
  for (const s of scopes) {
    const [key, value] = slices[s]();
    out[key] = value;
  }
  return JSON.stringify(out);
}

export interface ReportViewer {
  name: string;
  /** reportingCapabilities(role).showFinancialDetail — gates finance slices. */
  financeDetail: boolean;
}

export async function generateReport(
  ctx: OrgCtx,
  viewer: ReportViewer,
  reportId: string,
  jobId: RecordId,
  periodEnding: string,
): Promise<{ id?: RecordId; demoMode: boolean }> {
  const def = reportDef(reportId);
  if (!def) throw new Error(`Unknown report type: ${reportId}`);
  const job = await loadJobContext(ctx, jobId);
  if (!job) throw new Error("Job not found");

  const scopes = def.scopes.filter((s) => viewer.financeDetail || !FINANCE_SCOPES.includes(s));
  const context = buildReportContext(job, scopes);

  const { system } = getPrompt(def.promptKey);
  const res = await callClaude(system, `${def.periodLabel} ${periodEnding}. Project data:\n${context}`, {
    model: modelFor("drafting"),
    maxTokens: 1200,
  });

  const contentRaw = res.demo_mode
    ? `## Progress\n_Demo mode — no API key. This report was generated from a template._\n\n- ${job.phases.map((p) => `${p.name}: ${p.completionPct}%`).join("\n- ")}\n\n## Risks\n- ${job.risks.length} open risks\n\n## Next week\n- ${job.actions.length} open actions to progress`
    : res.content;
  const content = def.sectionTemplate ? applyWeeklyTemplate(contentRaw) : contentRaw.trim();
  const title =
    def.id === "weekly_progress"
      ? `Week ending ${periodEnding}`
      : `${def.title} — ${periodEnding}`;

  // Airtable (Spec 12): the report is a DOCUMENTS row — body in Text_Content,
  // lifecycle in AI_Analysis.module8. Doc_Status stays a neutral "Active".
  if (airtableEnabled()) {
    const stored = await getStorer()
      .put({ orgSlug: ctx.orgSlug, docType: REPORT_DOC_TYPE, name: `${title}.md` }, Buffer.from(content, "utf8"))
      .catch(() => null);
    // Supersede rule: regenerating the same (report type, period) overwrites the
    // existing draft instead of stacking duplicates. DOCUMENTS carries no job
    // link, so the match is per report+period (orgs are single-job today).
    const existing = (
      await core
        .list(ctx.orgSlug, "DOCUMENTS", {
          maxRecords: 500,
          filterByFormula: `LOWER({Document_Type})='${REPORT_DOC_TYPE.toLowerCase()}'`,
        })
        .catch(() => [])
    ).find((r) => {
      const m8 = parseReportModule8(r["AI_Analysis"]);
      return (
        m8?.status === "draft" &&
        m8.weekEnding === periodEnding &&
        (m8.reportId ?? "weekly_progress") === def.id
      );
    });
    const data = {
      jobId,
      title,
      docType: REPORT_DOC_TYPE,
      status: "Active",
      uploadedBy: viewer.name,
      textContent: content,
      storageProvider: stored?.provider ?? "",
      storageRef: stored?.ref ?? "",
      aiAnalysis: buildReportAnalysis({
        kind: "weekly_report",
        reportId: def.id,
        weekEnding: periodEnding,
        status: "draft",
        isAiGenerated: true,
        generatedAt: new Date().toISOString(),
      }),
    };
    const result = await writeRecord(
      ctx,
      existing
        ? { table: "document", op: "update", recordId: existing.id, data, actor: { type: "ai", name: "Report Writer" } }
        : { table: "document", op: "create", data, actor: { type: "ai", name: "Report Writer" } },
    );
    return { id: result.recordId ?? existing?.id, demoMode: res.demo_mode };
  }

  // Postgres: rich weekly_report row + an immutable DOCUMENTS snapshot for audit.
  const result = await writeRecord(ctx, {
    table: "weekly_report",
    op: "create",
    data: {
      jobId,
      weekEnding: periodEnding,
      title,
      content,
      isAiGenerated: true,
      status: "draft",
    },
    actor: { type: "ai", name: "Report Writer" },
  });
  if (result.recordId != null) {
    const snapshot = await generateManagedDocument(ctx, viewer.name, {
      jobId,
      title: `${title} (snapshot)`,
      docType: "report",
      outputType: "weekly_report_snapshot",
      format: "pdf",
      body: content,
      traceability: {
        sourceModule: "module8.weekly_reports",
        sourceRecordId: result.recordId,
      },
    });
    if (snapshot.id != null) {
      await writeRecord(ctx, {
        table: "weekly_report",
        op: "update",
        recordId: result.recordId,
        data: { documentId: snapshot.id },
        actor: { type: "system", name: "Document Management" },
      });
    }
  }
  return { id: result.recordId, demoMode: res.demo_mode };
}

/** Legacy alias for AI/system callers (scheduler, assistant executor) — the
 *  weekly report has always carried full financial detail on those paths. */
export function generateWeeklyReport(
  ctx: OrgCtx,
  userName: string,
  jobId: RecordId,
  weekEnding: string,
): Promise<{ id?: RecordId; demoMode: boolean }> {
  return generateReport(ctx, { name: userName, financeDetail: true }, "weekly_progress", jobId, weekEnding);
}

export async function approveReport(ctx: OrgCtx, userName: string, id: RecordId): Promise<void> {
  if (airtableEnabled()) {
    const doc = await core.get(ctx.orgSlug, "DOCUMENTS", String(id)).catch(() => null);
    await writeRecord(ctx, {
      table: "document",
      op: "update",
      recordId: id,
      data: {
        aiAnalysis: patchReportAnalysis(doc?.["AI_Analysis"], {
          status: "approved",
          approvedBy: userName,
          approvedAt: new Date().toISOString(),
        }),
      },
      actor: { type: "human", name: userName },
    });
    return;
  }
  await writeRecord(ctx, {
    table: "weekly_report",
    op: "update",
    recordId: id,
    data: { status: "approved", approvedBy: userName, approvedAt: new Date().toISOString() },
    actor: { type: "human", name: userName },
  });
}

export async function markReportSent(ctx: OrgCtx, userName: string, id: RecordId): Promise<void> {
  if (airtableEnabled()) {
    const doc = await core.get(ctx.orgSlug, "DOCUMENTS", String(id)).catch(() => null);
    await writeRecord(ctx, {
      table: "document",
      op: "update",
      recordId: id,
      data: {
        aiAnalysis: patchReportAnalysis(doc?.["AI_Analysis"], {
          status: "sent",
          sentAt: new Date().toISOString(),
        }),
      },
      actor: { type: "human", name: userName },
    });
  } else {
    await writeRecord(ctx, {
      table: "weekly_report",
      op: "update",
      recordId: id,
      data: { status: "sent", sentAt: new Date().toISOString() },
      actor: { type: "human", name: userName },
    });
  }
  await emitOutboundEvent(ctx, "report.ready", {
    entityType: "weekly_report",
    entityId: id,
    summary: "Weekly report sent",
    data: { sentBy: userName },
  });
}
