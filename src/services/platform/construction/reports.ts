// Weekly reports — AI-generated from live job data, human approval before
// sending (doc module 8: client-facing outputs).

import { callClaude } from "@/lib/claude";
import { loadJobContext } from "@/lib/platform/jobContextSource";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord, type RecordId } from "@/lib/platform/recordWriter";
import { OrgCtx } from "@/lib/platform/types";

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

  const content = res.demo_mode
    ? `## Progress\n_Demo mode — no API key. This report was generated from a template._\n\n- ${job.phases.map((p) => `${p.name}: ${p.completionPct}%`).join("\n- ")}\n\n## Risks\n- ${job.risks.length} open risks\n\n## Next week\n- ${job.actions.length} open actions to progress`
    : res.content;

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
