// Spec 12 Module 6 — JOBS completion deltas (lock plan §6.2). When a job's
// status transitions to Closed, three engagement-level deltas populate and
// feed the Learning Loop:
//   · Budget_Estimated vs Budget_Actual — Estimated_Value vs the app-side
//     BUDGET actuals (budgetActuals over confirmed PROCUREMENT, the same
//     derivation the budget dashboard uses; actuals are never entered manually)
//   · Schedule_Estimated vs Schedule_Actual — the planned end date
//     (Date_Estimated, falling back to Target_Completion) vs Date_Completed
//   · Scope_Changes_Count — CHANGE_LOG records linked to the job
//
// Phase- and task-level corrections feed the loop from CORRECTIONS; these
// engagement-level deltas feed it from completed JOBS: a material variance
// emits a module6 correction so the hypothesis engine can cluster it.
//
// Runs as a post-write hook next to the cascade engine (recordWriter) —
// Airtable mode only, idempotent (a job already carrying Date_Completed is
// skipped), and never fails the triggering write.

import { airtableEnabled, core } from "@/lib/airtable";
import { logger } from "@/lib/logger";
import type { CascadeWrite } from "@/lib/platform/cascade";
import { budgetActuals, loadProcurement } from "@/lib/platform/procurementSource";
import type { OrgCtx } from "@/lib/platform/types";

const S = (v: unknown): string => (typeof v === "string" ? v : "");
const N = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const linkIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter((s) => s.startsWith("rec")) : [];

/** Budget variance at/above this (absolute %) marks the job a learning-rule
 *  candidate and emits a module6 correction. Default, owner-tunable later. */
export const JOB_CLOSE_VARIANCE_PCT = 10;
/** Schedule slip at/above this many days emits a module6 correction. */
export const JOB_CLOSE_SCHEDULE_DAYS = 7;

const CLOSED = new Set(["closed", "complete", "completed"]);

export interface JobCloseDeltas {
  estimated: number;
  actual: number;
  variancePct: number | null;
  plannedEnd: string | null;
  completedAt: string;
  scheduleDeltaDays: number | null;
  scopeChangesCount: number;
}

/** Pure delta maths — unit-testable. */
export function computeJobCloseDeltas(args: {
  estimated: number;
  actual: number;
  plannedEnd: string | null;
  completedAt: string;
  scopeChangesCount: number;
}): JobCloseDeltas {
  const variancePct =
    args.estimated !== 0
      ? Math.round(((args.actual - args.estimated) / Math.abs(args.estimated)) * 1000) / 10
      : null;
  const scheduleDeltaDays = args.plannedEnd
    ? Math.round(
        (new Date(args.completedAt).getTime() - new Date(args.plannedEnd).getTime()) / 86_400_000,
      )
    : null;
  return { ...args, variancePct, scheduleDeltaDays };
}

/** Post-write hook: populate the completion deltas when a JOBS write closes
 *  the job. Best-effort throughout. */
export async function handleJobCompletion(ctx: OrgCtx, write: CascadeWrite): Promise<void> {
  try {
    if (!airtableEnabled()) return;
    if (write.table !== "job" || write.op !== "update") return;
    if (!CLOSED.has(S(write.data.status).toLowerCase())) return;
    const jobId = typeof write.recordId === "string" ? write.recordId : null;
    if (!jobId?.startsWith("rec")) return;

    const job = await core.get(ctx.orgSlug, "JOBS", jobId);
    if (!job) return;
    if (S(job["Date_Completed"])) return; // already closed out — idempotent

    // Budget actual: the job's BUDGET lines × app-side procurement actuals
    // (same derivation as the budget dashboard / job detail page).
    const budgetIds = linkIds(job["BUDGET"]);
    const [budgetRows, procRows] = await Promise.all([
      budgetIds.length
        ? core.list(ctx.orgSlug, "BUDGET", {
            filterByFormula: `OR(${budgetIds.map((id) => `RECORD_ID()='${id}'`).join(",")})`,
          })
        : Promise.resolve([]),
      loadProcurement(ctx),
    ]);
    const actualsByBudget = budgetActuals(procRows);
    const actual = budgetRows.reduce((s, b) => s + (actualsByBudget.get(b.id) ?? 0), 0);

    const completedAt = new Date().toISOString().slice(0, 10);
    const deltas = computeJobCloseDeltas({
      estimated: N(job["Estimated_Value"]),
      actual,
      plannedEnd: S(job["Date_Estimated"]) || S(job["Target_Completion"]) || null,
      completedAt,
      scopeChangesCount: linkIds(job["CHANGE_LOG"]).length,
    });

    const material =
      (deltas.variancePct != null && Math.abs(deltas.variancePct) >= JOB_CLOSE_VARIANCE_PCT) ||
      (deltas.scheduleDeltaDays != null && Math.abs(deltas.scheduleDeltaDays) >= JOB_CLOSE_SCHEDULE_DAYS);

    const summaryLines = [
      `Closed ${completedAt}.`,
      `Budget: estimated ${deltas.estimated} vs actual ${Math.round(deltas.actual)}${deltas.variancePct != null ? ` (${deltas.variancePct > 0 ? "+" : ""}${deltas.variancePct}%)` : ""}.`,
      deltas.plannedEnd
        ? `Schedule: planned end ${deltas.plannedEnd} vs actual ${completedAt} (${deltas.scheduleDeltaDays! > 0 ? "+" : ""}${deltas.scheduleDeltaDays} days).`
        : "Schedule: no planned end date recorded.",
      `Scope changes: ${deltas.scopeChangesCount} CHANGE_LOG record${deltas.scopeChangesCount === 1 ? "" : "s"}.`,
    ];

    await core.update(ctx.orgSlug, "JOBS", jobId, {
      Date_Completed: completedAt,
      Actual_Value: Math.round(deltas.actual * 100) / 100,
      ...(deltas.variancePct != null ? { Variance_Percent: deltas.variancePct } : {}),
      Actual_Summary: summaryLines.join("\n"),
      ...(material ? { Learning_Rule_Candidate: true } : {}),
    });
    // Scope_Changes_Count is a schema-drift-provisioned column — best-effort.
    await core
      .update(ctx.orgSlug, "JOBS", jobId, { Scope_Changes_Count: deltas.scopeChangesCount })
      .catch(() => {});

    await core
      .create(ctx.orgSlug, "EXECUTION_LOG", {
        Log_Entry: `job close ${S(job["Job_Name"])}`.slice(0, 200),
        Action_Type: "Update",
        Tables_Affected: "JOBS",
        Summary: JSON.stringify({ jobClose: { jobId, ...deltas } }),
        Initiated_By: "System",
        Status: "Done",
        Date_Time: new Date().toISOString(),
      })
      .catch(() => {});

    // Engagement-level learning fuel: material deltas become module6
    // corrections the hypothesis engine can cluster. Best-effort.
    if (material) {
      const { emitCorrection } = await import("@/lib/platform/corrections");
      const jobName = S(job["Job_Name"]) || jobId;
      if (deltas.variancePct != null && Math.abs(deltas.variancePct) >= JOB_CLOSE_VARIANCE_PCT) {
        await emitCorrection(ctx, write.actor, {
          entityType: "job",
          dimension: "job.budget_total",
          aiValue: deltas.estimated,
          humanValue: Math.round(deltas.actual),
          sourceModule: "module6",
          rootCauseCategory: "Estimation Error",
          rootCause: `Job "${jobName}" closed ${deltas.variancePct}% ${deltas.variancePct > 0 ? "over" : "under"} its estimate.`,
          context: { job: jobName },
        }).catch(() => {});
      }
      if (deltas.scheduleDeltaDays != null && Math.abs(deltas.scheduleDeltaDays) >= JOB_CLOSE_SCHEDULE_DAYS) {
        await emitCorrection(ctx, write.actor, {
          entityType: "job",
          dimension: "job.schedule_days",
          aiValueText: deltas.plannedEnd ?? "",
          humanValueText: completedAt,
          direction: deltas.scheduleDeltaDays > 0 ? "Under_Estimate" : "Over_Estimate",
          sourceModule: "module6",
          rootCauseCategory: "Estimation Error",
          rootCause: `Job "${jobName}" finished ${Math.abs(deltas.scheduleDeltaDays)} days ${deltas.scheduleDeltaDays > 0 ? "late" : "early"}.`,
          context: { job: jobName },
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.warn("Job-close delta hook failed", {
      orgId: ctx.orgId,
      recordId: write.recordId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
