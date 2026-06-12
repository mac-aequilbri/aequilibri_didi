// Weekly reports — AI-generated from live job data, human approval before
// sending (doc module 8: client-facing outputs).

import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord } from "@/lib/platform/recordWriter";
import { OrgCtx } from "@/lib/platform/types";

export async function generateWeeklyReport(
  ctx: OrgCtx,
  userName: string,
  jobId: number,
  weekEnding: string,
): Promise<{ id?: number; demoMode: boolean }> {
  const job = await prisma.platJob.findFirst({
    where: { id: jobId, orgId: ctx.orgId },
    include: {
      conPhases: { where: { isAiDraft: false }, orderBy: { sortOrder: "asc" } },
      conRisks: { where: { status: "open" } },
      conBudgets: true,
      conCashflows: { orderBy: { period: "desc" }, take: 3 },
      actions: { where: { status: { in: ["open", "in_progress"] } }, take: 10 },
      conVariations: { where: { status: { in: ["submitted", "approved"] } }, take: 5 },
    },
  });
  if (!job) throw new Error("Job not found");

  const context = JSON.stringify({
    job: { name: job.name, completionPct: job.completionPct, healthScore: job.healthScore },
    phases: job.conPhases.map((p) => ({ name: p.name, status: p.status, pct: p.completionPct })),
    openRisks: job.conRisks.map((r) => ({ desc: r.description, score: r.likelihood * r.impact })),
    budget: job.conBudgets.map((b) => ({
      category: b.category,
      budget: toNum(b.budgetAmount),
      actual: toNum(b.actualAmount),
    })),
    cashflow: job.conCashflows.map((c) => ({
      period: c.period,
      projected: toNum(c.projected),
      actual: toNum(c.actual),
    })),
    openActions: job.actions.map((a) => ({ title: a.title, owner: a.owner, due: a.dueDate })),
    variations: job.conVariations.map((v) => ({
      ref: v.refNumber,
      title: v.title,
      cost: toNum(v.costImpact),
      status: v.status,
    })),
  });

  const { system } = getPrompt("reports.weekly");
  const res = await callClaude(system, `Week ending ${weekEnding}. Project data:\n${context}`, {
    model: modelFor("drafting"),
    maxTokens: 1200,
  });

  const content = res.demo_mode
    ? `## Progress\n_Demo mode — no API key. This report was generated from a template._\n\n- ${job.conPhases.map((p) => `${p.name}: ${p.completionPct}%`).join("\n- ")}\n\n## Risks\n- ${job.conRisks.length} open risks\n\n## Next week\n- ${job.actions.length} open actions to progress`
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

export async function approveReport(ctx: OrgCtx, userName: string, id: number): Promise<void> {
  await writeRecord(ctx, {
    table: "weekly_report",
    op: "update",
    recordId: id,
    data: { status: "approved", approvedBy: userName, approvedAt: new Date().toISOString() },
    actor: { type: "human", name: userName },
  });
}

export async function markReportSent(ctx: OrgCtx, userName: string, id: number): Promise<void> {
  await writeRecord(ctx, {
    table: "weekly_report",
    op: "update",
    recordId: id,
    data: { status: "sent", sentAt: new Date().toISOString() },
    actor: { type: "human", name: userName },
  });
}
