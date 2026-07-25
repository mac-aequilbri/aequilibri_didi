import { describe, expect, it } from "vitest";
import { ganttLayout } from "./PlanView";
import type { PlanTaskView } from "@/lib/platform/planSource";

const task = (over: Partial<PlanTaskView>): PlanTaskView => ({
  id: "rec1",
  name: "t",
  jobId: null,
  jobName: null,
  phaseId: null,
  phaseName: null,
  startDate: null,
  endDate: null,
  durationDays: 0,
  status: "Not Started",
  rag: "",
  assignedTo: "",
  predecessorIds: [],
  notes: "",
  isOverdue: false,
  ...over,
});

describe("ganttLayout (Spec 12 M8 Gantt mode)", () => {
  it("returns no geometry when nothing is dated", () => {
    const { rows, min, todayPct } = ganttLayout([task({})]);
    expect(min).toBeNull();
    expect(todayPct).toBeNull();
    expect(rows[0].leftPct).toBeNull();
  });

  it("positions bars proportionally across the date range", () => {
    const { rows } = ganttLayout([
      task({ id: "a", startDate: new Date("2026-01-01"), endDate: new Date("2026-01-11") }),
      task({ id: "b", startDate: new Date("2026-01-11"), endDate: new Date("2026-01-21") }),
    ]);
    expect(rows[0].leftPct).toBe(0);
    expect(Math.round(rows[0].widthPct!)).toBe(50);
    expect(Math.round(rows[1].leftPct!)).toBe(50);
  });

  it("undated tasks in a dated set carry no bar; single-date tasks get a sliver", () => {
    const { rows } = ganttLayout([
      task({ id: "a", startDate: new Date("2026-01-01"), endDate: new Date("2026-03-01") }),
      task({ id: "b" }),
      task({ id: "c", startDate: new Date("2026-02-01") }),
    ]);
    expect(rows[1].leftPct).toBeNull();
    expect(rows[2].leftPct).not.toBeNull();
    expect(rows[2].widthPct!).toBeGreaterThanOrEqual(1.5);
  });
});
