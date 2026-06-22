// Projects (jobs) LIST data source — Postgres (default) or Airtable when the
// flag is on. Backs /app/[org]/projects. The list MUST emit the same id the
// detail page (jobDetailSource) resolves: a numeric PK in Postgres mode, a
// "rec…" id in Airtable mode. The old page read Postgres directly and linked
// numeric ids, so in Airtable mode the cards either hid Airtable-created jobs
// or 404'd the detail page — this source fixes that mismatch.
//
// Airtable JOBS is leaner than PlatJob (no code/engagementType/address/health),
// so those degrade to empty/zero; completionPct is derived from the job's
// non-draft phases, and per-job phase/risk counts are computed by grouping the
// PHASES/RISKS tables on their Job link (ACTION_HUB has no Job link, so the
// action count is 0 in Airtable mode — matching jobDetailSource).

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import type { OrgCtx } from "./types";

export interface JobListView {
  id: string;
  name: string;
  code: string;
  engagementType: string;
  address: string;
  suburb: string;
  status: string;
  completionPct: number;
  healthScore: number;
  budgetTotal: number;
  counts: { phases: number; actions: number; risks: number };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
/** Whether a linked-record cell points at the given record id. */
function linksTo(v: unknown, recordId: string): boolean {
  return Array.isArray(v) && v.some((x) => String(x) === recordId);
}

async function fromPostgres(ctx: OrgCtx): Promise<JobListView[]> {
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { conPhases: true, actions: true, conRisks: true } } },
  });
  return jobs.map((job) => ({
    id: String(job.id),
    name: job.name,
    code: job.code,
    engagementType: job.engagementType,
    address: job.address ?? "",
    suburb: job.suburb ?? "",
    status: job.status,
    completionPct: job.completionPct,
    healthScore: job.healthScore,
    budgetTotal: toNum(job.budgetTotal),
    counts: {
      phases: job._count.conPhases,
      actions: job._count.actions,
      risks: job._count.conRisks,
    },
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<JobListView[]> {
  const [jobRows, phaseRows, riskRows] = await Promise.all([
    core.list(ctx.orgSlug, "JOBS", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "PHASES", { maxRecords: 500 }),
    core.list(ctx.orgSlug, "RISKS", { maxRecords: 500 }),
  ]);

  return jobRows.map((job) => {
    const phases = phaseRows.filter(
      (p) => linksTo(p["Job"], job.id) && p["Is_AI_Draft"] !== true,
    );
    const openRisks = riskRows.filter(
      (r) => linksTo(r["Job"], job.id) && (str(r["Status"]) || "open") === "open",
    );
    const completionPct = phases.length
      ? Math.round(phases.reduce((s, p) => s + num(p["Completion_Pct"]), 0) / phases.length)
      : 0;
    return {
      id: job.id,
      name: str(job["Job_Name"]) || "(job)",
      code: "", // Airtable JOBS has no code field (see plan P4)
      engagementType: "",
      address: "",
      suburb: "",
      status: str(job["Status"]) || "open",
      completionPct,
      healthScore: 0, // not tracked in Airtable JOBS
      budgetTotal: num(job["Estimated_Value"]),
      counts: { phases: phases.length, actions: 0, risks: openRisks.length },
    };
  });
}

/** Load the projects list from whichever backend is active. */
export function loadJobsList(ctx: OrgCtx): Promise<JobListView[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
