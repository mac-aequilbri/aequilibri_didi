// Cashflow data source — Postgres (default) or Airtable when the flag is on.
// Cashflow is grouped per job, so the Airtable branch resolves the CASHFLOW
// rows' Job link against the JOBS table (Airtable JOBS has no "code" field, so
// code is left blank). Returns the same job-with-rows shape the page renders.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import type { OrgCtx } from "./types";

export interface CashflowRow {
  id: string;
  period: string;
  projected: number;
  actual: number;
  notes: string;
}

export interface JobCashflow {
  id: string;
  name: string;
  code: string;
  conCashflows: CashflowRow[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

async function fromPostgres(ctx: OrgCtx): Promise<JobCashflow[]> {
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { code: "asc" },
    include: { conCashflows: { orderBy: { period: "asc" } } },
  });
  return jobs.map((j) => ({
    id: String(j.id),
    name: j.name,
    code: j.code,
    conCashflows: j.conCashflows.map((c) => ({
      id: String(c.id),
      period: c.period,
      projected: toNum(c.projected),
      actual: toNum(c.actual),
      notes: c.notes,
    })),
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<JobCashflow[]> {
  const [jobRows, cfRows] = await Promise.all([
    core.list(ctx.orgSlug, "JOBS", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "CASHFLOW", { maxRecords: 500 }),
  ]);
  const byJob = new Map<string, CashflowRow[]>();
  for (const c of cfRows) {
    const link = c["Job"];
    const key = Array.isArray(link) && link.length > 0 ? String(link[0]) : "_unassigned";
    const row: CashflowRow = {
      id: c.id,
      period: str(c["Period"]),
      projected: num(c["Projected"]),
      actual: num(c["Actual"]),
      notes: str(c["Notes"]),
    };
    (byJob.get(key) ?? byJob.set(key, []).get(key)!).push(row);
  }
  for (const rows of byJob.values()) rows.sort((a, b) => a.period.localeCompare(b.period));
  return jobRows.map((j) => ({
    id: j.id,
    name: str(j["Job_Name"]) || "(job)",
    code: "",
    conCashflows: byJob.get(j.id) ?? [],
  }));
}

/** Load cashflow grouped by job from whichever backend is active. */
export function loadCashflowJobs(ctx: OrgCtx): Promise<JobCashflow[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
