// Phases data source — Postgres (default) or Airtable when the flag is on.
// Grouped per job (PHASES rows' Job link resolved against JOBS). The Airtable
// PHASES table has no evidence link or AI-suggestion field, so the evidence
// count is 0 and the suggestion is empty in that mode — the evidence/AI-vision
// workflow stays Postgres-only (its actions no-op against Airtable string ids).

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import type { OrgCtx } from "./types";

export interface PhaseView {
  id: string;
  name: string;
  status: string;
  completionPct: number;
  isAiDraft: boolean;
  jobId: string;
  evidenceSuggestion: string;
  _count: { evidence: number };
}

export interface JobPhases {
  id: string;
  name: string;
  code: string;
  conPhases: PhaseView[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

async function fromPostgres(ctx: OrgCtx): Promise<JobPhases[]> {
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { code: "asc" },
    include: {
      conPhases: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { evidence: true } } },
      },
    },
  });
  return jobs.map((j) => ({
    id: String(j.id),
    name: j.name,
    code: j.code,
    conPhases: j.conPhases.map((p) => ({
      id: String(p.id),
      name: p.name,
      status: p.status,
      completionPct: p.completionPct,
      isAiDraft: p.isAiDraft,
      jobId: String(p.jobId),
      evidenceSuggestion: p.evidenceSuggestion,
      _count: { evidence: p._count.evidence },
    })),
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<JobPhases[]> {
  const [jobRows, pRows] = await Promise.all([
    core.list(ctx.orgSlug, "JOBS", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "PHASES", { maxRecords: 500 }),
  ]);
  const byJob = new Map<string, PhaseView[]>();
  for (const p of pRows) {
    const link = p["Job"];
    const key = Array.isArray(link) && link.length > 0 ? String(link[0]) : "_unassigned";
    const row: PhaseView = {
      id: p.id,
      name: str(p["Phase_Name"]) || "(phase)",
      status: str(p["Status"]) || "pending",
      completionPct: num(p["Completion_Pct"]),
      isAiDraft: p["Is_AI_Draft"] === true,
      jobId: key,
      evidenceSuggestion: "{}",
      _count: { evidence: 0 },
    };
    (byJob.get(key) ?? byJob.set(key, []).get(key)!).push(row);
  }
  return jobRows.map((j) => ({
    id: j.id,
    name: str(j["Job_Name"]) || "(job)",
    code: "",
    conPhases: byJob.get(j.id) ?? [],
  }));
}

/** Load phases grouped by job from whichever backend is active. */
export function loadPhaseJobs(ctx: OrgCtx): Promise<JobPhases[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
