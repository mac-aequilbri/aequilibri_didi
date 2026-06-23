// Job context for AI generation — Postgres (default) or Airtable when the flag
// is on. The construction AI services (variation drafting, weekly reports,
// quote-from-budget) build a prompt context from a job and its related rows.
// Before this, those reads went straight to prisma.platJob, so generation was
// impossible for an Airtable-only org (no Postgres job to read). This source
// gives them one shape over either backend; the Airtable side filters the
// related tables by their Job link, exactly like jobDetailSource/jobsListSource.
//
// ACTION_HUB has no Job link in Airtable, so `actions` is empty in Airtable
// mode — matching jobDetailSource. Money values are display copies; authoritative
// math stays in app code (see money.ts).

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import type { RecordId } from "./recordWriter";
import type { OrgCtx } from "./types";

export interface JobContextPhase {
  name: string;
  status: string;
  completionPct: number;
}
export interface JobContextBudget {
  category: string;
  description: string;
  budgetAmount: number;
  committedAmount: number;
  actualAmount: number;
}
export interface JobContextRisk {
  description: string;
  likelihood: number;
  impact: number;
}
export interface JobContextCashflow {
  period: string;
  projected: number;
  actual: number;
}
export interface JobContextAction {
  title: string;
  owner: string;
  dueDate: Date | null;
}
export interface JobContextVariation {
  refNumber: string;
  title: string;
  costImpact: number;
  status: string;
}

export interface JobContext {
  id: string;
  name: string;
  budgetTotal: number;
  completionPct: number;
  healthScore: number;
  clientName: string;
  phases: JobContextPhase[];
  budget: JobContextBudget[];
  risks: JobContextRisk[];
  cashflow: JobContextCashflow[];
  actions: JobContextAction[];
  variations: JobContextVariation[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function linksTo(v: unknown, recordId: string): boolean {
  return Array.isArray(v) && v.some((x) => String(x) === recordId);
}

async function fromPostgres(ctx: OrgCtx, jobId: RecordId): Promise<JobContext | null> {
  const numId = Number(jobId);
  if (!Number.isInteger(numId)) return null;
  const job = await prisma.platJob.findFirst({
    where: { id: numId, orgId: ctx.orgId },
    include: {
      conPhases: { where: { isAiDraft: false }, orderBy: { sortOrder: "asc" } },
      conRisks: { where: { status: "open" } },
      conBudgets: { orderBy: { category: "asc" } },
      conCashflows: { orderBy: { period: "desc" }, take: 3 },
      actions: { where: { status: { in: ["open", "in_progress"] } }, take: 10 },
      conVariations: { where: { status: { in: ["submitted", "approved"] } }, take: 5 },
      clientContact: { select: { name: true } },
    },
  });
  if (!job) return null;
  return {
    id: String(job.id),
    name: job.name,
    budgetTotal: toNum(job.budgetTotal),
    completionPct: job.completionPct,
    healthScore: job.healthScore,
    clientName: job.clientContact?.name ?? "",
    phases: job.conPhases.map((p) => ({ name: p.name, status: p.status, completionPct: p.completionPct })),
    budget: job.conBudgets.map((b) => ({
      category: b.category,
      description: b.description,
      budgetAmount: toNum(b.budgetAmount),
      committedAmount: toNum(b.committedAmount),
      actualAmount: toNum(b.actualAmount),
    })),
    risks: job.conRisks.map((r) => ({ description: r.description, likelihood: r.likelihood, impact: r.impact })),
    cashflow: job.conCashflows.map((c) => ({
      period: c.period,
      projected: toNum(c.projected),
      actual: toNum(c.actual),
    })),
    actions: job.actions.map((a) => ({ title: a.title, owner: a.owner, dueDate: a.dueDate })),
    variations: job.conVariations.map((v) => ({
      refNumber: v.refNumber,
      title: v.title,
      costImpact: toNum(v.costImpact),
      status: v.status,
    })),
  };
}

async function fromAirtable(ctx: OrgCtx, jobId: RecordId): Promise<JobContext | null> {
  const id = String(jobId);
  if (!id.startsWith("rec")) return null;
  let job;
  try {
    job = await core.get(ctx.orgSlug, "JOBS", id);
  } catch {
    return null;
  }

  const [phaseRows, riskRows, budgetRows, cashflowRows, variationRows] = await Promise.all([
    core.list(ctx.orgSlug, "PHASES", { maxRecords: 500 }),
    core.list(ctx.orgSlug, "RISKS", { maxRecords: 500 }),
    core.list(ctx.orgSlug, "BUDGET", { maxRecords: 500 }),
    core.list(ctx.orgSlug, "CASHFLOW", { maxRecords: 500 }),
    core.list(ctx.orgSlug, "VARIATIONS", { maxRecords: 500 }),
  ]);

  const phases: JobContextPhase[] = phaseRows
    .filter((p) => linksTo(p["Job"], id) && p["Is_AI_Draft"] !== true)
    .sort((a, b) => num(a["Sort_Order"]) - num(b["Sort_Order"]))
    .map((p) => ({
      name: str(p["Phase_Name"]) || "(phase)",
      status: str(p["Status"]) || "pending",
      completionPct: num(p["Completion_Pct"]),
    }));

  const risks: JobContextRisk[] = riskRows
    .filter((r) => linksTo(r["Job"], id) && (str(r["Status"]) || "open") === "open")
    .map((r) => ({
      description: str(r["Risk"]) || "(risk)",
      likelihood: num(r["Likelihood"]) || 1,
      impact: num(r["Impact"]) || 1,
    }));

  const budget: JobContextBudget[] = budgetRows
    .filter((b) => linksTo(b["Job"], id))
    .map((b) => ({
      category: str(b["Category"]),
      description: str(b["Description"]) || str(b["Budget_Line"]),
      budgetAmount: num(b["Budget_Amount"]),
      committedAmount: num(b["Committed_Amount"]),
      actualAmount: num(b["Actual_Amount"]),
    }));

  const cashflow: JobContextCashflow[] = cashflowRows
    .filter((c) => linksTo(c["Job"], id))
    .sort((a, b) => str(b["Period"]).localeCompare(str(a["Period"])))
    .slice(0, 3)
    .map((c) => ({
      period: str(c["Period"]),
      projected: num(c["Projected"]),
      actual: num(c["Actual"]),
    }));

  const variations: JobContextVariation[] = variationRows
    .filter(
      (v) =>
        linksTo(v["Job"], id) &&
        ["submitted", "approved"].includes(str(v["Status"]) || "submitted"),
    )
    .slice(0, 5)
    .map((v) => ({
      refNumber: str(v["Ref_Number"]),
      title: str(v["Title"]) || "(variation)",
      costImpact: num(v["Cost_Impact"]),
      status: str(v["Status"]) || "submitted",
    }));

  return {
    id: job.id,
    name: str(job["Job_Name"]) || "(job)",
    budgetTotal: num(job["Estimated_Value"]),
    completionPct: phases.length
      ? Math.round(phases.reduce((s, p) => s + p.completionPct, 0) / phases.length)
      : 0,
    healthScore: 0, // not tracked in Airtable JOBS
    clientName: "", // no client-contact link surfaced on Airtable JOBS
    phases,
    budget,
    risks,
    cashflow,
    actions: [], // ACTION_HUB has no Job link in Airtable
    variations,
  };
}

/** Load a job's AI-generation context from whichever backend is active. */
export function loadJobContext(ctx: OrgCtx, jobId: RecordId): Promise<JobContext | null> {
  return airtableEnabled() ? fromAirtable(ctx, jobId) : fromPostgres(ctx, jobId);
}
