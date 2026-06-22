// Budget data source — Postgres (default) or Airtable when the flag is on.
// Grouped per job (BUDGET rows' Job link resolved against JOBS). The Airtable
// BUDGET table has no phase link, so phaseName is blank in that mode.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import type { OrgCtx } from "./types";

export interface BudgetLineView {
  id: string;
  category: string;
  description: string;
  budgetAmount: number;
  committedAmount: number;
  actualAmount: number;
  phaseName: string;
}

export interface JobBudget {
  id: string;
  name: string;
  code: string;
  conBudgets: BudgetLineView[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

async function fromPostgres(ctx: OrgCtx): Promise<JobBudget[]> {
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { code: "asc" },
    include: {
      conBudgets: { orderBy: [{ category: "asc" }], include: { phase: { select: { name: true } } } },
    },
  });
  return jobs.map((j) => ({
    id: String(j.id),
    name: j.name,
    code: j.code,
    conBudgets: j.conBudgets.map((b) => ({
      id: String(b.id),
      category: b.category,
      description: b.description,
      budgetAmount: toNum(b.budgetAmount),
      committedAmount: toNum(b.committedAmount),
      actualAmount: toNum(b.actualAmount),
      phaseName: b.phase?.name ?? "",
    })),
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<JobBudget[]> {
  const [jobRows, bRows] = await Promise.all([
    core.list(ctx.orgSlug, "JOBS", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "BUDGET", { maxRecords: 500 }),
  ]);
  const byJob = new Map<string, BudgetLineView[]>();
  for (const b of bRows) {
    const link = b["Job"];
    const key = Array.isArray(link) && link.length > 0 ? String(link[0]) : "_unassigned";
    const row: BudgetLineView = {
      id: b.id,
      category: str(b["Category"]),
      description: str(b["Description"]),
      budgetAmount: num(b["Budget_Amount"]),
      committedAmount: num(b["Committed_Amount"]),
      actualAmount: num(b["Actual_Amount"]),
      phaseName: "",
    };
    (byJob.get(key) ?? byJob.set(key, []).get(key)!).push(row);
  }
  for (const rows of byJob.values()) rows.sort((a, b) => a.category.localeCompare(b.category));
  return jobRows.map((j) => ({
    id: j.id,
    name: str(j["Job_Name"]) || "(job)",
    code: "",
    conBudgets: byJob.get(j.id) ?? [],
  }));
}

/** Load budget grouped by job from whichever backend is active. */
export function loadBudgetJobs(ctx: OrgCtx): Promise<JobBudget[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
