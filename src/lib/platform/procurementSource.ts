// Procurement data source — Postgres (default) or the Airtable PROCUREMENT
// table when AIRTABLE_MIGRATION is enabled. Status values match the app's;
// writes use the client's typecast so any missing select option is created.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
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
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
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
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<ProcurementView[]> {
  const rows = await core.list(ctx.orgSlug, "PROCUREMENT", { maxRecords: 200 });
  return rows.map((r) => ({
    id: r.id,
    item: str(r["Item"]) || "(untitled item)",
    jobCode: null,
    vendorName: str(r["Vendor_Name"]),
    qty: num(r["Qty"]),
    total: num(r["Total"]),
    dueDate: str(r["Due_Date"]) || null,
    status: str(r["Status"]) || "pending",
  }));
}

/** Load procurement orders from whichever backend is active. */
export function loadProcurement(ctx: OrgCtx): Promise<ProcurementView[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
