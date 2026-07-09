// Org dashboard data — Postgres (default) or Airtable when the flag is on.
// The landing page after the org picker, so it must run Postgres-free. Reuses
// loadJobsList (jobs + derived completion) and getActiveRules; the rest is
// counted/aggregated from the org's base, including pending proposals from
// PENDING_WRITES in Airtable mode.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { getActiveRules } from "@/services/platform/learning";
import { toNum } from "@/lib/format";
import { resolveActionStatus } from "./actionStatus";
import { loadActionStatusMap } from "./configSource";
import { loadJobsList } from "./jobsListSource";
import { budgetActuals, loadProcurement } from "./procurementSource";
import type { OrgCtx } from "./types";

export interface DashJob {
  id: string;
  name: string;
  code: string;
  engagementType: string;
  completionPct: number;
  status: string;
}
export interface DashLog {
  id: string;
  operation: string;
  targetTable: string;
  actorType: string;
  actorName: string;
  status: string;
}
export interface DashCashflow {
  period: string;
  projected: number;
  actual: number;
}
export interface DashboardView {
  jobs: DashJob[];
  openActions: number;
  overdueActions: number;
  pendingProposals: number;
  budget: number;
  actual: number;
  recentLogs: DashLog[];
  activeRules: number;
  cashflow: DashCashflow[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

async function fromAirtable(ctx: OrgCtx): Promise<DashboardView> {
  const [jobList, rules, actionRows, budgetRows, cashflowRows, logRows, pendingRows, procRows, statusMap] = await Promise.all([
    loadJobsList(ctx),
    getActiveRules(ctx),
    core.list(ctx.orgSlug, "ISSUES", { maxRecords: 1000 }),
    core.list(ctx.orgSlug, "BUDGET", { maxRecords: 1000 }),
    core.list(ctx.orgSlug, "CASHFLOWS", { maxRecords: 1000 }),
    core.list(ctx.orgSlug, "EXECUTION_LOG", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "PENDING_WRITES", { maxRecords: 1000 }),
    loadProcurement(ctx),
    loadActionStatusMap(ctx),
  ]);
  const actualsByBudget = budgetActuals(procRows); // BUDGET rec id → computed Actual

  // Same status definition as the Action Hub (actionsSource): only cleanly-
  // resolved Open/In Progress rows count; unrecognised values aren't guessed in.
  const now = Date.now();
  const openActionRows = actionRows.filter((a) => {
    const res = resolveActionStatus(str(a["Status"]), statusMap);
    return res.clean && (res.canonical === "open" || res.canonical === "in_progress");
  });
  const overdueActions = openActionRows.filter((a) => {
    const d = str(a["Due_Date"]);
    return d && new Date(d).getTime() < now;
  }).length;

  // Spec 12 CASHFLOWS is a per-transaction ledger; derive the period
  // projected-vs-actual chart from it — Paid rows are actual, the rest projected.
  const byPeriod = new Map<string, { projected: number; actual: number }>();
  for (const c of cashflowRows) {
    const period = str(c["Period"]);
    if (!period) continue;
    const agg = byPeriod.get(period) ?? { projected: 0, actual: 0 };
    const amount = num(c["Amount"]);
    if (str(c["Status"]) === "Paid") agg.actual += amount;
    else agg.projected += amount;
    byPeriod.set(period, agg);
  }

  return {
    jobs: jobList.slice(0, 6).map((j) => ({
      id: j.id,
      name: j.name,
      code: j.code,
      engagementType: j.engagementType,
      completionPct: j.completionPct,
      status: j.status,
    })),
    openActions: openActionRows.length,
    overdueActions,
    pendingProposals: pendingRows.filter((r) => str(r["Status"]).toLowerCase() === "proposed").length,
    budget: budgetRows.reduce((s, b) => s + num(b["Estimated"]), 0),
    actual: budgetRows.reduce((s, b) => s + (actualsByBudget.get(b.id) ?? 0), 0),
    recentLogs: logRows.slice(0, 8).map((l) => ({
      id: l.id,
      operation: str(l["Action_Type"]),
      targetTable: str(l["Tables_Affected"]),
      actorType: str(l["Initiated_By"]),
      actorName: "",
      status: str(l["Status"]) || "executed",
    })),
    activeRules: rules.length,
    cashflow: [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, projected: v.projected, actual: v.actual })),
  };
}

async function fromPostgres(ctx: OrgCtx): Promise<DashboardView> {
  const [jobs, openActions, overdueActions, pendingProposals, budgetAgg, recentLogs, activeRules] =
    await Promise.all([
      prisma.platJob.findMany({ where: { orgId: ctx.orgId }, orderBy: { updatedAt: "desc" }, take: 6 }),
      prisma.platActionHub.count({ where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] } } }),
      prisma.platActionHub.count({
        where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] }, dueDate: { lt: new Date() } },
      }),
      prisma.platPendingWrite.count({ where: { orgId: ctx.orgId, status: "proposed" } }),
      prisma.platConBudgetLine.aggregate({
        where: { orgId: ctx.orgId },
        _sum: { budgetAmount: true, actualAmount: true },
      }),
      prisma.platExecutionLog.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.platLearningRule.count({ where: { orgId: ctx.orgId, isActive: true } }),
    ]);

  const cashflows = await prisma.platConCashflow.findMany({
    where: { orgId: ctx.orgId },
    select: { period: true, projected: true, actual: true },
  });
  const byPeriod = new Map<string, { projected: number; actual: number }>();
  for (const c of cashflows) {
    const agg = byPeriod.get(c.period) ?? { projected: 0, actual: 0 };
    agg.projected += toNum(c.projected);
    agg.actual += toNum(c.actual);
    byPeriod.set(c.period, agg);
  }

  return {
    jobs: jobs.map((j) => ({
      id: String(j.id),
      name: j.name,
      code: j.code,
      engagementType: j.engagementType,
      completionPct: j.completionPct,
      status: j.status,
    })),
    openActions,
    overdueActions,
    pendingProposals,
    budget: toNum(budgetAgg._sum.budgetAmount ?? 0),
    actual: toNum(budgetAgg._sum.actualAmount ?? 0),
    recentLogs: recentLogs.map((l) => ({
      id: String(l.id),
      operation: l.operation,
      targetTable: l.targetTable,
      actorType: l.actorType,
      actorName: l.actorName,
      status: l.status,
    })),
    activeRules,
    cashflow: [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, projected: v.projected, actual: v.actual })),
  };
}

export function loadDashboard(ctx: OrgCtx): Promise<DashboardView> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
