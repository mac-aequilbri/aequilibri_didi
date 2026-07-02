// Procurement data source — Postgres (default) or the Airtable PROCUREMENT
// table when AIRTABLE_MIGRATION is enabled. Status values match the app's;
// writes use the client's typecast so any missing select option is created.
//
// Spec 12 PROCUREMENT: Procurement_Name · Quantity · Unit_Cost · Supplier(link)
// · Budget_Category(link) · Status · Job. Total_Cost is a formula in Airtable
// (Quantity × Unit_Cost); we compute it app-side. budgetActuals() derives the
// BUDGET.Actual rollup app-side (sum of linked procurement where invoiced/paid).

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import { mulMoney, sumMoney } from "./money";
import type { OrgCtx } from "./types";

export interface ProcurementView {
  id: string;
  item: string;
  jobCode: string | null;
  vendorName: string;
  qty: number;
  total: number;
  dueDate: Date | string | null;
  status: string;
  /** Airtable rec id of the linked BUDGET row (Airtable mode only), for
   *  computing BUDGET.Actual app-side; null in Postgres mode / when unlinked. */
  budgetCategoryId: string | null;
}

/** PROCUREMENT statuses that count toward BUDGET.Actual (Spec 12: Invoiced/Paid). */
const ACTUAL_STATUSES = new Set(["invoiced", "paid"]);

/**
 * Compute BUDGET.Actual per budget row app-side (the Airtable rollup we can't
 * create via API). Returns a map of BUDGET rec id → summed Total_Cost of its
 * linked PROCUREMENT rows whose Status is Invoiced or Paid.
 */
export function budgetActuals(rows: ProcurementView[]): Map<string, number> {
  const byBudget = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.budgetCategoryId || !ACTUAL_STATUSES.has(r.status.toLowerCase())) continue;
    (byBudget.get(r.budgetCategoryId) ?? byBudget.set(r.budgetCategoryId, []).get(r.budgetCategoryId)!).push(r.total);
  }
  const out = new Map<string, number>();
  for (const [id, amounts] of byBudget) out.set(id, sumMoney(amounts));
  return out;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function firstLink(v: unknown): string | null {
  return Array.isArray(v) && v.length > 0 ? String(v[0]) : null;
}

async function fromPostgres(ctx: OrgCtx): Promise<ProcurementView[]> {
  const rows = await prisma.platConProcurement.findMany({
    where: { orgId: ctx.orgId },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: { job: { select: { code: true } }, vendor: { select: { name: true } } },
  });
  return rows.map((o) => ({
    id: String(o.id),
    item: o.item,
    jobCode: o.job?.code ?? null,
    vendorName: o.vendor?.name || o.vendorName,
    qty: o.qty,
    total: toNum(o.total),
    dueDate: o.dueDate,
    status: o.status,
    budgetCategoryId: null,
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<ProcurementView[]> {
  const rows = await core.list(ctx.orgSlug, "PROCUREMENT", { maxRecords: 200 });
  return rows.map((r) => {
    const qty = num(r["Quantity"]);
    return {
      id: r.id,
      item: str(r["Procurement_Name"]) || "(untitled item)",
      jobCode: null,
      // Supplier is a link to ORGANISATIONS, not a text field — left blank here
      // (resolving the link to a name is out of scope for this pass).
      vendorName: "",
      qty,
      total: mulMoney(qty, num(r["Unit_Cost"])), // Total_Cost formula, computed app-side
      dueDate: str(r["Expected_Date"]) || null,
      status: str(r["Status"]) || "Ordered",
      budgetCategoryId: firstLink(r["Budget_Category"]),
    };
  });
}

/** Load procurement orders from whichever backend is active. */
export function loadProcurement(ctx: OrgCtx): Promise<ProcurementView[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
