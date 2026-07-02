// Job detail data source — Postgres (default) or Airtable when the flag is on.
// Backs /app/[org]/projects/[id]. The page renders a uniform JobDetailView so
// the swap is invisible; loadJobDetail returns null when the job is absent
// (page → notFound()). This is the first DETAIL page wired onto Airtable: the
// id is a numeric PK in Postgres mode and an "rec…" record id in Airtable mode,
// which is exactly why the old page's Number(id) lookup 404s after acceptance.
//
// Airtable JOBS is leaner than PlatJob — it has no code/engagementType/address/
// healthScore, and ACTION_HUB has no Job link — so those degrade to empty/zero
// in Airtable mode (completionPct is derived from phases). Related rows are
// read from the canonical tables and filtered by their Job link, matching the
// list-page sources (budgetSource/phasesSource/risksSource).

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { budgetActuals, loadProcurement } from "./procurementSource";
import { toNum } from "@/lib/format";
import type { OrgCtx } from "./types";

export interface JobPhaseRow {
  id: string;
  name: string;
  status: string;
  completionPct: number;
}
export interface JobRiskRow {
  id: string;
  description: string;
  likelihood: number;
  impact: number;
}
export interface JobActionRow {
  id: string;
  title: string;
  owner: string;
  dueDate: Date | null;
}

export interface JobDetailView {
  id: string;
  name: string;
  code: string;
  engagementType: string;
  address: string;
  suburb: string;
  completionPct: number;
  healthScore: number;
  summary: string;
  budget: number;
  actual: number;
  phases: JobPhaseRow[];
  risks: JobRiskRow[];
  actions: JobActionRow[];
  counts: { bimModels: number; documents: number; variations: number };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
/** Length of a linked-record cell (an array of rec ids), 0 if not a link. */
function linkCount(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}
/** Whether a linked-record cell points at the given record id. */
function linksTo(v: unknown, recordId: string): boolean {
  return Array.isArray(v) && v.some((x) => String(x) === recordId);
}

async function fromPostgres(ctx: OrgCtx, id: string): Promise<JobDetailView | null> {
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) return null;
  const job = await prisma.platJob.findFirst({
    where: { id: jobId, orgId: ctx.orgId },
    include: {
      conPhases: { where: { isAiDraft: false }, orderBy: { sortOrder: "asc" } },
      conRisks: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 5 },
      actions: {
        where: { status: { in: ["open", "in_progress"] } },
        orderBy: { dueDate: "asc" },
        take: 5,
      },
      conBudgets: true,
      _count: { select: { conBimModels: true, documents: true, conVariations: true } },
    },
  });
  if (!job) return null;
  return {
    id: String(job.id),
    name: job.name,
    code: job.code,
    engagementType: job.engagementType,
    address: job.address ?? "",
    suburb: job.suburb ?? "",
    completionPct: job.completionPct,
    healthScore: job.healthScore,
    summary: job.summary ?? "",
    budget: job.conBudgets.reduce((s, b) => s + toNum(b.budgetAmount), 0),
    actual: job.conBudgets.reduce((s, b) => s + toNum(b.actualAmount), 0),
    phases: job.conPhases.map((p) => ({
      id: String(p.id),
      name: p.name,
      status: p.status,
      completionPct: p.completionPct,
    })),
    risks: job.conRisks.map((r) => ({
      id: String(r.id),
      description: r.description,
      likelihood: r.likelihood,
      impact: r.impact,
    })),
    actions: job.actions.map((a) => ({
      id: String(a.id),
      title: a.title,
      owner: a.owner,
      dueDate: a.dueDate,
    })),
    counts: {
      bimModels: job._count.conBimModels,
      documents: job._count.documents,
      variations: job._count.conVariations,
    },
  };
}

async function fromAirtable(ctx: OrgCtx, id: string): Promise<JobDetailView | null> {
  if (!id.startsWith("rec")) return null;
  let job;
  try {
    job = await core.get(ctx.orgSlug, "JOBS", id);
  } catch {
    return null; // 404 / deleted / wrong-base → not found
  }

  // Related rows live in the canonical tables; filter by their Job link rather
  // than trusting the (possibly stale) linked-record arrays on the job record.
  const [phaseRows, riskRows, budgetRows, procRows] = await Promise.all([
    core.list(ctx.orgSlug, "PHASES", { maxRecords: 500 }),
    core.list(ctx.orgSlug, "RISKS", { maxRecords: 500 }),
    core.list(ctx.orgSlug, "BUDGET", { maxRecords: 500 }),
    loadProcurement(ctx),
  ]);
  const actualsByBudget = budgetActuals(procRows); // BUDGET rec id → computed Actual

  const phases: JobPhaseRow[] = phaseRows
    .filter((p) => linksTo(p["Job"], id) && p["Is_AI_Draft"] !== true)
    .sort((a, b) => num(a["Sort_Order"]) - num(b["Sort_Order"]))
    .map((p) => ({
      id: p.id,
      name: str(p["Phase_Name"]) || "(phase)",
      status: str(p["Status"]) || "pending",
      completionPct: num(p["Completion_Pct"]),
    }));

  const risks: JobRiskRow[] = riskRows
    .filter((r) => linksTo(r["Job"], id) && (str(r["Status"]) || "open") === "open")
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      description: str(r["Risk"]) || "(untitled risk)",
      likelihood: num(r["Likelihood"]) || 1,
      impact: num(r["Impact"]) || 1,
    }));

  const jobBudget = budgetRows.filter((b) => linksTo(b["Job"], id));
  const budget = jobBudget.reduce((s, b) => s + num(b["Estimated"]), 0);
  const actual = jobBudget.reduce((s, b) => s + (actualsByBudget.get(b.id) ?? 0), 0);

  // No completion field on Airtable JOBS — derive from non-draft phases.
  const completionPct = phases.length
    ? Math.round(phases.reduce((s, p) => s + p.completionPct, 0) / phases.length)
    : 0;

  return {
    id: job.id,
    name: str(job["Job_Name"]) || "(job)",
    code: "", // Airtable JOBS has no code field (see plan P4)
    engagementType: "",
    address: "",
    suburb: "",
    completionPct,
    healthScore: 0, // not tracked in Airtable JOBS
    summary: str(job["Estimated_Summary"]) || str(job["Description"]),
    budget,
    actual,
    phases,
    risks,
    actions: [], // ACTION_HUB has no Job link in Airtable — empty in this mode
    counts: {
      bimModels: linkCount(job["BIM_MODELS"]),
      documents: 0, // JOBS has no DOCUMENTS link in Airtable
      variations: linkCount(job["VARIATIONS"]),
    },
  };
}

/** Load a single job's detail view from whichever backend is active. */
export function loadJobDetail(ctx: OrgCtx, id: string): Promise<JobDetailView | null> {
  return airtableEnabled() ? fromAirtable(ctx, id) : fromPostgres(ctx, id);
}
