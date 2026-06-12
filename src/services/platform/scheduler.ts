// Scheduled automation (the doc's n8n role): correction processing at
// volume, periodic Intelligence Snapshots, and optional weekly report
// drafts. Invoked by /api/platform/scheduler — point any scheduler at it
// (GitHub Actions cron ships with the repo; n8n/Render cron can call the
// same endpoint later).
//
// Cadence is self-managing so the caller can fire hourly without thought:
//  - hypothesis engine: every run (cheap; no-op when nothing unclustered)
//  - intelligence snapshot: when the latest is older than 6 days
//  - weekly report drafts: Mondays (UTC), for active jobs missing a draft
//    for the current week — opt-in per org (costs AI tokens) via the
//    PlatCfgSetting "automation.weekly_reports" = true

import { prisma } from "@/lib/db";
import { getOrgCtx } from "@/lib/platform/org-context";
import { generateWeeklyReport } from "./construction/reports";
import { runHypothesisEngine, snapshotIntelligence } from "./learning";

const SNAPSHOT_MAX_AGE_DAYS = 6;

export interface SchedulerRunResult {
  orgs: number;
  hypotheses: { created: number; updated: number };
  snapshots: number;
  reportsDrafted: number;
  errors: string[];
}

async function wantsAutoReports(orgId: number): Promise<boolean> {
  const setting = await prisma.platCfgSetting.findFirst({
    where: { orgId, key: "automation.weekly_reports" },
  });
  if (!setting) return false;
  try {
    return JSON.parse(setting.value) === true;
  } catch {
    return false;
  }
}

function lastSunday(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back to Sunday
  return d;
}

export async function runScheduledTasks(now = new Date()): Promise<SchedulerRunResult> {
  const result: SchedulerRunResult = {
    orgs: 0,
    hypotheses: { created: 0, updated: 0 },
    snapshots: 0,
    reportsDrafted: 0,
    errors: [],
  };

  const orgs = await prisma.platOrganisation.findMany({ where: { isActive: true } });
  for (const org of orgs) {
    const ctx = await getOrgCtx(org.slug);
    if (!ctx) continue;
    result.orgs++;

    // 1. Correction processing (doc Phase 3 pipeline).
    try {
      const engine = await runHypothesisEngine(ctx);
      result.hypotheses.created += engine.created;
      result.hypotheses.updated += engine.updated;
    } catch (err) {
      result.errors.push(`${org.slug} hypothesis engine: ${err}`);
    }

    // 2. Periodic Intelligence Snapshot.
    try {
      const latest = await prisma.platIntelligenceSnapshot.findFirst({
        where: { orgId: ctx.orgId },
        orderBy: { capturedAt: "desc" },
      });
      const ageDays = latest
        ? (now.getTime() - latest.capturedAt.getTime()) / 86_400_000
        : Infinity;
      if (ageDays > SNAPSHOT_MAX_AGE_DAYS) {
        await snapshotIntelligence(ctx);
        result.snapshots++;
      }
    } catch (err) {
      result.errors.push(`${org.slug} snapshot: ${err}`);
    }

    // 3. Weekly report drafts (opt-in; Mondays UTC).
    try {
      if (now.getUTCDay() === 1 && (await wantsAutoReports(ctx.orgId))) {
        const weekEnding = lastSunday(now);
        const jobs = await prisma.platJob.findMany({
          where: { orgId: ctx.orgId, status: "active" },
          select: { id: true },
        });
        for (const job of jobs) {
          const existing = await prisma.platConWeeklyReport.findFirst({
            where: { orgId: ctx.orgId, jobId: job.id, weekEnding },
          });
          if (existing) continue;
          await generateWeeklyReport(
            ctx,
            "scheduler",
            job.id,
            weekEnding.toISOString().slice(0, 10),
          );
          result.reportsDrafted++;
        }
      }
    } catch (err) {
      result.errors.push(`${org.slug} reports: ${err}`);
    }
  }

  await prisma.platExecutionLog
    .createMany({
      data: orgs.map((org) => ({
        orgId: org.id,
        actorType: "system",
        actorName: "scheduler",
        operation: "generate",
        targetTable: "scheduler_run",
        payload: JSON.stringify({
          snapshots: result.snapshots,
          hypotheses: result.hypotheses,
          reportsDrafted: result.reportsDrafted,
        }),
        status: result.errors.length ? "failed" : "executed",
        executedAt: now,
        error: result.errors.filter((e) => e.startsWith(org.slug)).join("; ").slice(0, 900),
      })),
    })
    .catch(() => {});

  return result;
}
