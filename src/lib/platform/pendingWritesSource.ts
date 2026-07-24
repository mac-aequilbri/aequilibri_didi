import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import type { RecordId } from "@/lib/platform/recordWriter";
import type { OrgCtx } from "./types";

export interface PendingWriteView {
  id: RecordId;
  tableKey: string;
  op: string;
  recordId: string;
  /** The proposal's target job (rec id / numeric string), for RLS scoping of
   *  the approval queue. null = org-global. Airtable stores it only in the
   *  payload, so we fall back to that when the Job_Id column is blank. */
  jobId: string | null;
  payload: string;
  actorType: string;
  actorName: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  resolvedBy: string;
  resolvedAt: Date | null;
  error: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** The job id embedded in a proposal payload (Airtable rec id or Postgres
 *  numeric), or null. The write path always posts jobId on a create. */
function jobIdFromPayload(payload: string): string | null {
  try {
    const j = (JSON.parse(payload) as { jobId?: unknown }).jobId;
    return j == null || j === "" ? null : String(j);
  } catch {
    return null;
  }
}

function date(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fromPostgres(ctx: OrgCtx): Promise<PendingWriteView[]> {
  const rows = await prisma.platPendingWrite.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    tableKey: r.tableKey,
    op: r.op,
    recordId: r.recordId == null ? "" : String(r.recordId),
    jobId: r.jobId != null ? String(r.jobId) : jobIdFromPayload(r.payload),
    payload: r.payload,
    actorType: r.actorType,
    actorName: r.actorName,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    resolvedBy: r.resolvedBy,
    resolvedAt: r.resolvedAt,
    error: r.error,
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<PendingWriteView[]> {
  const rows = await core.list(ctx.orgSlug, "PENDING_WRITES", { maxRecords: 1000 });
  return rows
    .map((r) => ({
      id: r.id,
      tableKey: str(r["Table_Key"]),
      op: str(r["Op"]),
      recordId: str(r["Record_Id"]),
      jobId: str(r["Job_Id"]) || jobIdFromPayload(str(r["Payload"])),
      payload: str(r["Payload"]),
      actorType: str(r["Actor_Type"]),
      actorName: str(r["Actor_Name"]),
      status: str(r["Status"]),
      createdAt: date(r["Created_At"]) ?? new Date(0),
      expiresAt: date(r["Expires_At"]) ?? new Date(0),
      resolvedBy: str(r["Resolved_By"]),
      resolvedAt: date(r["Resolved_At"]),
      error: str(r["Error"]),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function loadPendingWrites(ctx: OrgCtx): Promise<PendingWriteView[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}

/** Server-side filter for the approval queue's "awaiting decision" rows. Every
 *  proposed-count reader (nav badges, dashboard, coordination) must use these
 *  exact list opts so one render shares a single cached request. */
export const PROPOSED_PENDING_FORMULA = `LOWER({Status})='proposed'`;

/** Count of proposed (awaiting-approval) pending writes only — cheaper than
 *  loadPendingWrites when the resolved history isn't needed. */
export async function loadProposedPendingCount(ctx: OrgCtx): Promise<number> {
  if (!airtableEnabled()) {
    return prisma.platPendingWrite.count({ where: { orgId: ctx.orgId, status: "proposed" } });
  }
  const rows = await core.list(ctx.orgSlug, "PENDING_WRITES", {
    maxRecords: 1000,
    filterByFormula: PROPOSED_PENDING_FORMULA,
  });
  return rows.length;
}
