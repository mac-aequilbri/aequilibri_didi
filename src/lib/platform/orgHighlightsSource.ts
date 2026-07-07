// Lightweight org highlights for the client-picker cards. This is a slimmed
// cousin of dashboardSource: the picker only needs four counts, so it fetches
// three tables (JOBS, ISSUES, PENDING_WRITES) instead of the dashboard's ~eight
// — keeping the per-card lazy fetch cheap. Status/field conventions mirror
// dashboardSource exactly so the numbers match the org dashboard.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import type { OrgCtx } from "./types";

export interface OrgHighlights {
  projects: number;
  openActions: number;
  overdueActions: number;
  pendingApprovals: number;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fromAirtable(ctx: OrgCtx): Promise<OrgHighlights> {
  const [jobRows, actionRows, pendingRows] = await Promise.all([
    core.list(ctx.orgSlug, "JOBS", { maxRecords: 200 }),
    core.list(ctx.orgSlug, "ISSUES", { maxRecords: 1000 }),
    core.list(ctx.orgSlug, "PENDING_WRITES", { maxRecords: 1000 }),
  ]);

  const openSet = new Set(["Open", "In Progress"]);
  const now = Date.now();
  const openActionRows = actionRows.filter((a) => openSet.has(str(a["Status"])));
  const overdueActions = openActionRows.filter((a) => {
    const d = str(a["Due_Date"]);
    return d && new Date(d).getTime() < now;
  }).length;

  return {
    projects: jobRows.length,
    openActions: openActionRows.length,
    overdueActions,
    pendingApprovals: pendingRows.filter((r) => str(r["Status"]).toLowerCase() === "proposed").length,
  };
}

async function fromPostgres(ctx: OrgCtx): Promise<OrgHighlights> {
  const [projects, openActions, overdueActions, pendingApprovals] = await Promise.all([
    prisma.platJob.count({ where: { orgId: ctx.orgId } }),
    prisma.platActionHub.count({ where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] } } }),
    prisma.platActionHub.count({
      where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] }, dueDate: { lt: new Date() } },
    }),
    prisma.platPendingWrite.count({ where: { orgId: ctx.orgId, status: "proposed" } }),
  ]);
  return { projects, openActions, overdueActions, pendingApprovals };
}

export function loadOrgHighlights(ctx: OrgCtx): Promise<OrgHighlights> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
