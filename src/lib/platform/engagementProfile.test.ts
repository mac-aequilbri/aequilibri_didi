import { describe, expect, it } from "vitest";
import {
  defaultProfileFor,
  normalizeEngagementType,
  resolveProfile,
} from "./engagementProfile";

describe("engagementProfile", () => {
  it("spec defaults: four engagement types map to the four PLAN render modes", () => {
    expect(defaultProfileFor("long_project").planView).toBe("gantt");
    expect(defaultProfileFor("short_job").planView).toBe("checklist");
    expect(defaultProfileFor("ongoing").planView).toBe("workflow");
    expect(defaultProfileFor("seasonal").planView).toBe("season");
  });

  it("short jobs carry risk flags inline — no full risk register", () => {
    expect(defaultProfileFor("short_job").fullRiskRegister).toBe(false);
    expect(defaultProfileFor("long_project").fullRiskRegister).toBe(true);
  });

  it("normalizes stored Engagement_Type cells to app keys", () => {
    expect(normalizeEngagementType("Long Project")).toBe("long_project");
    expect(normalizeEngagementType("Ongoing Lifecycle")).toBe("ongoing");
    expect(normalizeEngagementType("Seasonal Cycle")).toBe("seasonal");
    expect(normalizeEngagementType("weird")).toBe("");
  });

  it("an Active config row overrides only the flags it sets", () => {
    const p = resolveProfile("long_project", [
      {
        engagementType: "long_project",
        active: true,
        planView: "checklist",
        fullRiskRegister: null, // column absent → default stands
        cashflowPeriod: "",
        portfolioView: false,
      },
    ]);
    expect(p.planView).toBe("checklist");
    expect(p.fullRiskRegister).toBe(true);
    expect(p.cashflowPeriod).toBe("monthly");
  });

  it("inactive rows are ignored; defaults apply", () => {
    const p = resolveProfile("long_project", [
      {
        engagementType: "long_project",
        active: false,
        planView: "checklist",
        fullRiskRegister: false,
        cashflowPeriod: "weekly",
        portfolioView: true,
      },
    ]);
    expect(p).toEqual(defaultProfileFor("long_project"));
  });

  it("portfolio view activates org-wide when any Active row opts in (D-11)", () => {
    const rows = [
      { engagementType: "short_job" as const, active: true, planView: "" as const, fullRiskRegister: null, cashflowPeriod: "", portfolioView: true },
    ];
    expect(resolveProfile("long_project", rows).portfolioView).toBe(true);
    expect(resolveProfile("long_project", []).portfolioView).toBe(false);
  });
});
