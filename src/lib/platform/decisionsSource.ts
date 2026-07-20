// Decisions data source — switches between Postgres (default) and the canonical
// Airtable DECISIONS table when AIRTABLE_MIGRATION is enabled. The page renders
// a uniform DecisionView regardless of source, so the swap is invisible to the
// UI. This is the first page wired onto the Airtable layer; the same shape
// (loader returning a view model) is how the rest will follow.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { dateInput, type EditorValues } from "./recordEditor";
import type { OrgCtx } from "./types";

export interface DecisionView {
  id: string;
  description: string;
  jobCode: string | null;
  rationale: string;
  madeBy: string;
  sourceType: string;
  status: string;
  date: string | Date | null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fromPostgres(ctx: OrgCtx): Promise<DecisionView[]> {
  const rows = await prisma.platDecision.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 2000,
    include: { job: { select: { code: true } } },
  });
  return rows.map((d) => ({
    id: String(d.id),
    description: d.description,
    jobCode: d.job?.code ?? null,
    rationale: d.rationale,
    madeBy: d.madeBy,
    sourceType: d.sourceType,
    status: d.status,
    date: d.decidedAt ?? d.createdAt,
  }));
}

// Airtable DECISIONS status -> app status (so the page's confirm/supersede
// controls, keyed on app values, are reachable in Airtable mode).
const AIR_TO_APP_DECISION_STATUS: Record<string, string> = {
  Pending: "proposed",
  // Governance canonical (§5.3). "Made" stays recognised for records written
  // before the vocab alignment; live "Approved" rows previously fell through
  // to the "proposed" fallback and showed the wrong status.
  Approved: "confirmed",
  Made: "confirmed",
  Reversed: "superseded",
};

async function fromAirtable(ctx: OrgCtx): Promise<DecisionView[]> {
  const rows = await core.list(ctx.orgSlug, "DECISIONS", { maxRecords: 200 });
  return rows.map((r) => {
    const owner = r["Owner"];
    return {
      id: r.id,
      description:
        str(r["Decision_Description"]) || str(r["Decision_Name"]) || "(untitled decision)",
      jobCode: null,
      rationale: str(r["Rationale"]),
      // Owner is a TEAM linked record; name resolution is a later step.
      madeBy: Array.isArray(owner) && owner.length > 0 ? "(linked)" : "—",
      sourceType: "airtable",
      status: AIR_TO_APP_DECISION_STATUS[str(r["Status"])] ?? "proposed",
      date: str(r["Decision_Date"]) || null,
    };
  });
}

/** Load decisions for the page from whichever backend is active. */
export function loadDecisions(ctx: OrgCtx): Promise<DecisionView[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}

/** Form-ready values for a single decision's edit page. Fields are limited to
 *  those the Airtable field map persists (description, rationale, status,
 *  decidedAt). Null if the record isn't in this org. */
export async function loadDecisionDetail(ctx: OrgCtx, id: string): Promise<EditorValues | null> {
  if (airtableEnabled()) {
    let r: Record<string, unknown> | null = null;
    try {
      r = await core.get(ctx.orgSlug, "DECISIONS", id);
    } catch {
      return null;
    }
    if (!r) return null;
    return {
      description: str(r["Decision_Description"]) || str(r["Decision_Name"]),
      rationale: str(r["Rationale"]),
      status: AIR_TO_APP_DECISION_STATUS[str(r["Status"])] ?? "proposed",
      decidedAt: dateInput(str(r["Decision_Date"]) || null),
    };
  }
  const d = await prisma.platDecision.findFirst({ where: { id: Number(id), orgId: ctx.orgId } });
  if (!d) return null;
  return {
    description: d.description,
    rationale: d.rationale,
    status: d.status,
    decidedAt: dateInput(d.decidedAt),
  };
}
