import { describe, expect, it } from "vitest";
import { calcConfidence, combine, confidenceBand } from "./confidence";
import { diffForCorrections } from "./corrections";
import { getPrompt } from "./prompts";
import { modelFor } from "./modelRouter";
import { validateRecord } from "./recordWriter";

describe("recordWriter validateRecord (typecast layer)", () => {
  it("coerces form-style strings on create", () => {
    const out = validateRecord("budget_line", "create", {
      jobId: "7",
      category: "Concrete",
      budgetAmount: "120000",
      actualAmount: "131500.50",
    });
    expect(out.jobId).toBe(7);
    expect(out.budgetAmount).toBe(120000);
    expect(out.actualAmount).toBe(131500.5);
    expect(out.committedAmount).toBe(0); // default applied
  });

  it("coerces checkbox booleans and empty dates", () => {
    const out = validateRecord("risk", "create", {
      jobId: 3,
      description: "Supplier capacity",
      createdByAi: "on",
      escalatedAt: "",
    });
    expect(out.createdByAi).toBe(true);
    expect(out.escalatedAt).toBeUndefined();
    expect(out.likelihood).toBe(3);
  });

  it("rejects missing required fields", () => {
    expect(() => validateRecord("action", "create", { title: "" })).toThrow();
    expect(() => validateRecord("cashflow", "create", { jobId: 1, period: "June" })).toThrow();
  });

  it("rejects invalid JSON in json-string columns", () => {
    expect(() =>
      validateRecord("action", "create", { title: "x", context: "{not json" }),
    ).toThrow();
  });

  it("update schemas are partial", () => {
    const out = validateRecord("action", "update", { status: "done" });
    expect(out).toEqual({ status: "done" });
  });

  it("parses ISO date strings revived from stored proposals", () => {
    const out = validateRecord("action", "update", { dueDate: "2026-06-15T00:00:00.000Z" });
    expect(out.dueDate).toBeInstanceOf(Date);
  });
});

describe("confidence calculator", () => {
  it("weights signals", () => {
    expect(
      calcConfidence([
        { source: "a", weight: 1, score: 100 },
        { source: "b", weight: 1, score: 50 },
      ]),
    ).toBe(75);
  });
  it("returns 0 with no usable weight", () => {
    expect(calcConfidence([])).toBe(0);
  });
  it("combines multiplicatively and bands", () => {
    expect(combine(90, 80)).toBe(72);
    expect(confidenceBand(85)).toBe("high");
    expect(confidenceBand(60)).toBe("medium");
    expect(confidenceBand(10)).toBe("low");
  });
});

describe("diffForCorrections", () => {
  const base = {
    entityType: "variation_order",
    jobId: 1,
    rootCause: "edited on approval",
    rootCauseCategory: "Estimation Error" as const,
    sourceModule: "module3" as const,
  };
  it("emits one correction per changed numeric dimension", () => {
    const out = diffForCorrections(
      { costImpact: 18400, timeImpactDays: 6 },
      { costImpact: 22000, timeImpactDays: 6 },
      [
        { field: "costImpact", dimension: "variation.cost_impact" },
        { field: "timeImpactDays", dimension: "variation.time_impact" },
      ],
      base,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      dimension: "variation.cost_impact",
      aiValue: 18400,
      humanValue: 22000,
    });
  });
  it("ignores non-numeric and unchanged fields", () => {
    const out = diffForCorrections({ a: "x" }, { a: "y" }, [{ field: "a", dimension: "d" }], base);
    expect(out).toHaveLength(0);
  });
});

describe("prompt assembler", () => {
  it("interpolates variables and returns a version stamp", () => {
    const { system, version } = getPrompt("assistant.chat", {
      persona: "You are Didi.",
      orgName: "Dulong Downs",
      jobLine: " on job DD-001",
      rulesBlock: "CRITICAL RULES:\n- rule one",
    });
    expect(system).toContain("You are Didi.");
    expect(system).toContain("Dulong Downs");
    expect(system).toContain("rule one");
    expect(version).toBe("assistant.chat@1.0");
  });
  it("throws on unknown template", () => {
    expect(() => getPrompt("nope")).toThrow();
  });
});

describe("model router", () => {
  it("routes tasks to tiers", () => {
    expect(modelFor("classification")).toContain("haiku");
    expect(modelFor("chat")).toContain("sonnet");
    expect(modelFor("complex_reasoning")).toContain("opus");
  });
});
