// Lightweight org counts for the client-picker cards and the sidebar nav
// badges — the single compute behind the OrgMetricsSnapshot cached on the org's
// registry row (see control.ts). Status/field conventions mirror
// dashboardSource exactly so the numbers match the org dashboard.
//
// Count-only tables are read with the status filter pushed into
// filterByFormula, so the response carries just the matching rows instead of
// the whole table. Two exceptions, both to share one cached request with other
// readers in the same render: ISSUES stays a full read (open/in-progress is
// resolved through the per-org status map app-side, and the dashboard reads
// the identical list), and RISKS uses the register's exact opts (jobs list +
// risk register + coordination all read it unfiltered). RISKS/VARIATIONS are
// optional Domain-tier tables on supplied bases — a base without them must
// count 0, not fail the whole batch.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { resolveActionStatus } from "./actionStatus";
import { loadActionStatusMap } from "./configSource";
import { listOptional } from "./optionalList";
import { PROPOSED_PENDING_FORMULA } from "./pendingWritesSource";
import type { OrgCtx } from "./types";

export interface OrgHighlights {
  projects: number;
  openActions: number;
  overdueActions: number;
  pendingApprovals: number;
  openRisks: number;
  openVariations: number;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Blank status defaults to the "open-ish" state in app code (see
// dashboardSource/navCounts history), so the formula must match blanks too.
const SUBMITTED_VARIATIONS_FORMULA = `OR({Status}='submitted',{Status}=BLANK())`;

async function fromAirtable(ctx: OrgCtx): Promise<OrgHighlights> {
  const f = ctx.config.features;
  const [jobRows, actionRows, pendingRows, riskRows, variationRows, statusMap] = await Promise.all([
    core.list(ctx.orgSlug, "JOBS", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "ISSUES", { maxRecords: 1000 }),
    core.list(ctx.orgSlug, "PENDING_WRITES", { maxRecords: 1000, filterByFormula: PROPOSED_PENDING_FORMULA }),
    // Same opts as loadRisks/loadJobsList so a dashboard render reuses their read.
    f.risks ? listOptional(ctx.orgSlug, "RISKS", { maxRecords: 500 }) : Promise.resolve([]),
    f.variations
      ? listOptional(ctx.orgSlug, "VARIATIONS", { maxRecords: 1000, filterByFormula: SUBMITTED_VARIATIONS_FORMULA })
      : Promise.resolve([]),
    loadActionStatusMap(ctx),
  ]);

  const now = Date.now();
  const openActionRows = actionRows.filter((a) => {
    const res = resolveActionStatus(str(a["Status"]), statusMap);
    return res.clean && (res.canonical === "open" || res.canonical === "in_progress");
  });
  const overdueActions = openActionRows.filter((a) => {
    const d = str(a["Due_Date"]);
    return d && new Date(d).getTime() < now;
  }).length;

  return {
    projects: jobRows.length,
    openActions: openActionRows.length,
    overdueActions,
    pendingApprovals: pendingRows.length,
    openRisks: riskRows.filter((r) => (str(r["Status"]) || "open") === "open").length,
    openVariations: variationRows.length,
  };
}

async function fromPostgres(ctx: OrgCtx): Promise<OrgHighlights> {
  const f = ctx.config.features;
  const [projects, openActions, overdueActions, pendingApprovals, openRisks, openVariations] =
    await Promise.all([
      prisma.platJob.count({ where: { orgId: ctx.orgId } }),
      prisma.platActionHub.count({ where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] } } }),
      prisma.platActionHub.count({
        where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] }, dueDate: { lt: new Date() } },
      }),
      prisma.platPendingWrite.count({ where: { orgId: ctx.orgId, status: "proposed" } }),
      f.risks
        ? prisma.platConRisk.count({ where: { orgId: ctx.orgId, status: "open" } })
        : Promise.resolve(0),
      f.variations
        ? prisma.platConVariationOrder.count({ where: { orgId: ctx.orgId, status: "submitted" } })
        : Promise.resolve(0),
    ]);
  return { projects, openActions, overdueActions, pendingApprovals, openRisks, openVariations };
}

export function loadOrgHighlights(ctx: OrgCtx): Promise<OrgHighlights> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
