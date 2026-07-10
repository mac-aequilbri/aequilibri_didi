// Risk register data source — Postgres (default) or the Airtable RISKS table
// (Domain Extension, created in the base) when AIRTABLE_MIGRATION is enabled.
// Status values (open/accepted/mitigated/closed) match the app's, so no
// remapping is needed. First Domain-tier page wired to Airtable.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import type { EditorValues } from "./recordEditor";
import type { OrgCtx } from "./types";

export interface RiskView {
  id: string;
  description: string;
  jobCode: string | null;
  likelihood: number;
  impact: number;
  mitigation: string;
  status: string;
  owner: string;
  escalatedAt: Date | null;
  escalationNote: string;
  createdByAi: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

async function fromPostgres(ctx: OrgCtx): Promise<RiskView[]> {
  const risks = await prisma.platConRisk.findMany({
    where: { orgId: ctx.orgId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { job: { select: { code: true } } },
  });
  return risks.map((r) => ({
    id: String(r.id),
    description: r.description,
    jobCode: r.job?.code ?? null,
    likelihood: r.likelihood,
    impact: r.impact,
    mitigation: r.mitigation,
    status: r.status,
    owner: r.owner,
    escalatedAt: r.escalatedAt,
    escalationNote: r.escalationNote,
    createdByAi: r.createdByAi,
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<RiskView[]> {
  // Opts shared with loadJobsList + loadOrgHighlights — one cached read/render.
  const rows = await core.list(ctx.orgSlug, "RISKS", { maxRecords: 500 });
  return rows.map((r) => {
    const esc = str(r["Escalated_At"]);
    return {
      id: r.id,
      description: str(r["Risk"]) || "(untitled risk)",
      jobCode: null,
      likelihood: num(r["Likelihood"]) || 1,
      impact: num(r["Impact"]) || 1,
      mitigation: str(r["Mitigation"]),
      status: str(r["Status"]) || "open",
      owner: str(r["Owner"]),
      escalatedAt: esc ? new Date(esc) : null,
      escalationNote: str(r["Escalation_Note"]),
      createdByAi: r["Created_By_AI"] === true,
    };
  });
}

/** Load the risk register from whichever backend is active. */
export function loadRisks(ctx: OrgCtx): Promise<RiskView[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}

/** Form-ready values for a single risk's edit page. Null if not in this org. */
export async function loadRiskDetail(ctx: OrgCtx, id: string): Promise<EditorValues | null> {
  if (airtableEnabled()) {
    let r: Record<string, unknown> | null = null;
    try {
      r = await core.get(ctx.orgSlug, "RISKS", id);
    } catch {
      return null;
    }
    if (!r) return null;
    return {
      description: str(r["Risk"]),
      likelihood: num(r["Likelihood"]) || 3,
      impact: num(r["Impact"]) || 3,
      mitigation: str(r["Mitigation"]),
      owner: str(r["Owner"]),
      status: str(r["Status"]) || "open",
    };
  }
  const r = await prisma.platConRisk.findFirst({ where: { id: Number(id), orgId: ctx.orgId } });
  if (!r) return null;
  return {
    description: r.description,
    likelihood: r.likelihood,
    impact: r.impact,
    mitigation: r.mitigation,
    owner: r.owner,
    status: r.status,
  };
}
