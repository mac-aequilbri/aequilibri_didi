// Cashflow data source — Postgres (default) or Airtable when the flag is on.
// Grouped per job (CASHFLOWS rows' Job link resolved against JOBS).
//
// Spec 12 CASHFLOWS is a per-transaction ledger: Cashflow_Name · Period ·
// Type(In/Out) · Amount · Source_Or_Payee · Category · Status · Job · Notes.
// (The old projected/actual-per-period shape is gone.) The Postgres branch is
// legacy — its projected/actual columns are mapped best-effort into txns so the
// page still renders in Postgres mode; production runs Airtable mode.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { comparePeriods, toNum } from "@/lib/format";
import type { EditorValues } from "./recordEditor";
import type { OrgCtx } from "./types";

export type CashflowType = "In" | "Out";

export interface CashflowTxn {
  id: string;
  name: string;
  period: string;
  type: CashflowType;
  amount: number;
  sourceOrPayee: string;
  category: string;
  status: string;
  notes: string;
}

export interface JobCashflow {
  id: string;
  name: string;
  code: string;
  conCashflows: CashflowTxn[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function asType(v: unknown): CashflowType {
  return str(v) === "In" ? "In" : "Out";
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
    // Legacy mapping: one forecast "Out" txn (projected) + one paid "Out" txn
    // (actual) per period row, so the per-transaction view still renders.
    conCashflows: j.conCashflows.flatMap((c): CashflowTxn[] => {
      const base = { period: c.period, type: "Out" as const, sourceOrPayee: "", category: "", notes: c.notes };
      const txns: CashflowTxn[] = [];
      if (toNum(c.projected)) txns.push({ id: `${c.id}-f`, name: `${c.period} forecast`, amount: toNum(c.projected), status: "Forecast", ...base });
      if (toNum(c.actual)) txns.push({ id: `${c.id}-a`, name: `${c.period} actual`, amount: toNum(c.actual), status: "Paid", ...base });
      return txns;
    }),
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<JobCashflow[]> {
  const [jobRows, cfRows] = await Promise.all([
    core.list(ctx.orgSlug, "JOBS", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "CASHFLOWS", { maxRecords: 500 }),
  ]);
  const byJob = new Map<string, CashflowTxn[]>();
  for (const c of cfRows) {
    const link = c["Job"];
    const key = Array.isArray(link) && link.length > 0 ? String(link[0]) : "_unassigned";
    const row: CashflowTxn = {
      id: c.id,
      name: str(c["Cashflow_Name"]),
      period: str(c["Period"]),
      type: asType(c["Type"]),
      amount: num(c["Amount"]),
      sourceOrPayee: str(c["Source_Or_Payee"]),
      category: str(c["Category"]),
      status: str(c["Status"]) || "Forecast",
      notes: str(c["Notes"]),
    };
    (byJob.get(key) ?? byJob.set(key, []).get(key)!).push(row);
  }
  for (const rows of byJob.values()) rows.sort((a, b) => comparePeriods(a.period, b.period));
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

/** Form-ready values for a single cashflow entry's edit page. The per-transaction
 *  ledger is the Airtable (Spec 12) shape; the legacy Postgres branch splits each
 *  period row into synthetic non-editable txns, so editing is Airtable-only here
 *  (null otherwise). */
export async function loadCashflowDetail(ctx: OrgCtx, id: string): Promise<EditorValues | null> {
  if (!airtableEnabled()) return null;
  let c: Record<string, unknown> | null = null;
  try {
    c = await core.get(ctx.orgSlug, "CASHFLOWS", id);
  } catch {
    return null;
  }
  if (!c) return null;
  return {
    name: str(c["Cashflow_Name"]),
    period: str(c["Period"]),
    type: asType(c["Type"]),
    amount: num(c["Amount"]),
    sourceOrPayee: str(c["Source_Or_Payee"]),
    category: str(c["Category"]),
    status: str(c["Status"]) || "Forecast",
    notes: str(c["Notes"]),
  };
}
