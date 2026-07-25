import { describe, expect, it } from "vitest";
import {
  computeJobCloseDeltas,
  JOB_CLOSE_SCHEDULE_DAYS,
  JOB_CLOSE_VARIANCE_PCT,
} from "./closeJob";

describe("job completion deltas (Spec 12 Module 6)", () => {
  it("computes budget variance % against the estimate", () => {
    const d = computeJobCloseDeltas({
      estimated: 100_000,
      actual: 112_500,
      plannedEnd: null,
      completedAt: "2026-07-24",
      scopeChangesCount: 2,
    });
    expect(d.variancePct).toBe(12.5);
    expect(d.scheduleDeltaDays).toBeNull();
  });

  it("no variance signal without an estimate (never divides by zero)", () => {
    const d = computeJobCloseDeltas({
      estimated: 0,
      actual: 5000,
      plannedEnd: null,
      completedAt: "2026-07-24",
      scopeChangesCount: 0,
    });
    expect(d.variancePct).toBeNull();
  });

  it("computes schedule delta in days (late positive, early negative)", () => {
    const late = computeJobCloseDeltas({
      estimated: 0,
      actual: 0,
      plannedEnd: "2026-07-10",
      completedAt: "2026-07-24",
      scopeChangesCount: 0,
    });
    expect(late.scheduleDeltaDays).toBe(14);
    const early = computeJobCloseDeltas({
      estimated: 0,
      actual: 0,
      plannedEnd: "2026-07-30",
      completedAt: "2026-07-24",
      scopeChangesCount: 0,
    });
    expect(early.scheduleDeltaDays).toBe(-6);
  });

  it("materiality thresholds are the documented defaults", () => {
    expect(JOB_CLOSE_VARIANCE_PCT).toBe(10);
    expect(JOB_CLOSE_SCHEDULE_DAYS).toBe(7);
  });
});
