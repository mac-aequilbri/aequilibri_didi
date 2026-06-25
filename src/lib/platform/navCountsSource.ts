// Sidebar badge counts — Postgres (default) or Airtable when the flag is on.
// These run in the org layout on EVERY platform page, so they must not touch
// Postgres in a Postgres-free deployment. Counts are derived by listing the
// org's base tables and filtering in app (fine at these volumes).
//
// pending (approval queue) is counted from PENDING_WRITES in Airtable mode.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { logger, errMeta } from "@/lib/logger";
import type { OrgCtx } from "./types";

const ZERO_COUNTS: NavCounts = {
  jobs: 0,
  pending: 0,
  openActions: 0,
  openRisks: 0,
  openVariations: 0,
};

export interface NavCounts {
  jobs: number;
  pending: number;
  openActions: number;
  openRisks: number;
  openVariations: number;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fromAirtable(ctx: OrgCtx, f: Record<string, boolean>): Promise<NavCounts> {
  const [jobRows, actionRows, riskRows, variationRows, pendingRows] = await Promise.all([
    core.list(ctx.orgSlug, "JOBS", { maxRecords: 1000 }),
    core.list(ctx.orgSlug, "ACTION_HUB", { maxRecords: 1000 }),
    f.risks ? core.list(ctx.orgSlug, "RISKS", { maxRecords: 1000 }) : Promise.resolve([]),
    f.variations ? core.list(ctx.orgSlug, "VARIATIONS", { maxRecords: 1000 }) : Promise.resolve([]),
    core.list(ctx.orgSlug, "PENDING_WRITES", { maxRecords: 1000 }),
  ]);
  const openAction = new Set(["Open", "In Progress"]);
  return {
    jobs: jobRows.length,
    pending: pendingRows.filter((p) => (str(p["Status"]) || "").toLowerCase() === "proposed").length,
    openActions: actionRows.filter((a) => openAction.has(str(a["Status"]))).length,
    openRisks: riskRows.filter((r) => (str(r["Status"]) || "open") === "open").length,
    openVariations: variationRows.filter((v) => (str(v["Status"]) || "submitted") === "submitted").length,
  };
}

async function fromPostgres(ctx: OrgCtx, f: Record<string, boolean>): Promise<NavCounts> {
  const [jobs, pending, openActions, openRisks, openVariations] = await Promise.all([
    prisma.platJob.count({ where: { orgId: ctx.orgId } }),
    prisma.platPendingWrite.count({ where: { orgId: ctx.orgId, status: "proposed" } }),
    prisma.platActionHub.count({
      where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] } },
    }),
    f.risks
      ? prisma.platConRisk.count({ where: { orgId: ctx.orgId, status: "open" } })
      : Promise.resolve(0),
    f.variations
      ? prisma.platConVariationOrder.count({ where: { orgId: ctx.orgId, status: "submitted" } })
      : Promise.resolve(0),
  ]);
  return { jobs, pending, openActions, openRisks, openVariations };
}

/** Sidebar badge counts from whichever backend is active. These render in the
 *  org layout on every page, so a read failure (e.g. a base missing a table)
 *  must NOT crash the whole shell — degrade to zeros so admin/diagnostic pages
 *  stay reachable to fix the underlying problem. */
export async function loadNavCounts(ctx: OrgCtx): Promise<NavCounts> {
  const f = ctx.config.features;
  try {
    return await (airtableEnabled() ? fromAirtable(ctx, f) : fromPostgres(ctx, f));
  } catch (err) {
    logger.warn("Nav counts unavailable — degrading to zeros", {
      org: ctx.orgSlug,
      ...errMeta(err),
    });
    return ZERO_COUNTS;
  }
}
