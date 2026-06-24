// Weekly reports — AI-generated from live job data, human approval before
// sending (doc module 8: client-facing outputs).

import { callClaude } from "@/lib/claude";
import { loadJobContext } from "@/lib/platform/jobContextSource";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord, type RecordId } from "@/lib/platform/recordWriter";
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

export async function generateWeeklyReport(
  ctx: OrgCtx,
  userName: string,
  jobId: RecordId,
  weekEnding: string,
): Promise<{ id?: RecordId; demoMode: boolean }> {
  const job = await loadJobContext(ctx, jobId);
  if (!job) throw new Error("Job not found");

  const context = JSON.stringify({
    job: { name: job.name, completionPct: job.completionPct, healthScore: job.healthScore },
    phases: job.phases.map((p) => ({ name: p.name, status: p.status, pct: p.completionPct })),
    openRisks: job.risks.map((r) => ({ desc: r.description, score: r.likelihood * r.impact })),
    budget: job.budget.map((b) => ({
      category: b.category,
      budget: b.budgetAmount,
      actual: b.actualAmount,
    })),
    cashflow: job.cashflow.map((c) => ({
      period: c.period,
      projected: c.projected,
      actual: c.actual,
    })),
    openActions: job.actions.map((a) => ({ title: a.title, owner: a.owner, due: a.dueDate })),
    variations: job.variations.map((v) => ({
      ref: v.refNumber,
      title: v.title,
      cost: v.costImpact,
      status: v.status,
    })),
  });

  const { system } = getPrompt("reports.weekly");
  const res = await callClaude(system, `Week ending ${weekEnding}. Project data:\n${context}`, {
    model: modelFor("drafting"),
    maxTokens: 1200,
  });

  const contentRaw = res.demo_mode
    ? `## Progress\n_Demo mode — no API key. This report was generated from a template._\n\n- ${job.phases.map((p) => `${p.name}: ${p.completionPct}%`).join("\n- ")}\n\n## Risks\n- ${job.risks.length} open risks\n\n## Next week\n- ${job.actions.length} open actions to progress`
    : res.content;
  const content = applyWeeklyTemplate(contentRaw);

  const result = await writeRecord(ctx, {
    table: "weekly_report",
    op: "create",
    data: {
      jobId,
      weekEnding,
      title: `Week ending ${weekEnding}`,
      content,
      isAiGenerated: true,
      status: "draft",
    },
    actor: { type: "ai", name: "Report Writer" },
  });
  if (result.recordId != null) {
    const snapshot = await generateManagedDocument(ctx, userName, {
      jobId,
      title: `Weekly report (${weekEnding})`,
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
  void userName;
  return { id: result.recordId, demoMode: res.demo_mode };
}

export async function approveReport(ctx: OrgCtx, userName: string, id: RecordId): Promise<void> {
  await writeRecord(ctx, {
    table: "weekly_report",
    op: "update",
    recordId: id,
    data: { status: "approved", approvedBy: userName, approvedAt: new Date().toISOString() },
    actor: { type: "human", name: userName },
  });
}

export async function markReportSent(ctx: OrgCtx, userName: string, id: RecordId): Promise<void> {
  await writeRecord(ctx, {
    table: "weekly_report",
    op: "update",
    recordId: id,
    data: { status: "sent", sentAt: new Date().toISOString() },
    actor: { type: "human", name: userName },
  });
}
