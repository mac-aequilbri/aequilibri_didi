import { describe, expect, it } from "vitest";
import { CASCADE_RULES, CASCADE_RULE_SEEDS } from "./cascade";

const rule = (code: string) => CASCADE_RULES.find((r) => r.code === code)!;

describe("cascade rule triggers (Spec 12 Module 5 rules a–g)", () => {
  it("defines all seven rules with unique codes", () => {
    expect(CASCADE_RULES).toHaveLength(7);
    expect(new Set(CASCADE_RULES.map((r) => r.code)).size).toBe(7);
  });

  it("A — phase status change fires; unrelated phase edits don't", () => {
    const a = rule("CASCADE-A");
    expect(a.trigger({ status: "In Progress" }, "update")).toBe(true);
    expect(a.trigger({ completionPct: 50 }, "update")).toBe(false);
  });

  it("C — budget forecast or estimate changes fire", () => {
    const c = rule("CASCADE-C");
    expect(c.trigger({ forecast: "1200" }, "update")).toBe(true);
    expect(c.trigger({ budgetAmount: 900 }, "create")).toBe(true);
    expect(c.trigger({ rag: "Amber" }, "update")).toBe(false);
  });

  it("D — procurement Invoiced/Paid fires case-insensitively; other statuses don't", () => {
    const d = rule("CASCADE-D");
    expect(d.trigger({ status: "Invoiced" }, "update")).toBe(true);
    expect(d.trigger({ status: "paid" }, "update")).toBe(true);
    expect(d.trigger({ status: "Delivered" }, "update")).toBe(false);
    expect(d.trigger({ dueDate: "2026-08-01" }, "update")).toBe(false);
  });

  it("E — expected-date change fires on update only", () => {
    const e = rule("CASCADE-E");
    expect(e.trigger({ dueDate: "2026-08-01" }, "update")).toBe(true);
    expect(e.trigger({ dueDate: "2026-08-01" }, "create")).toBe(false);
  });

  it("F — Blocker issue type fires; other types don't", () => {
    const f = rule("CASCADE-F");
    expect(f.trigger({ issueType: "Blocker" }, "create")).toBe(true);
    expect(f.trigger({ issueType: "Open Action" }, "create")).toBe(false);
  });

  it("G — risk status materialised fires", () => {
    const g = rule("CASCADE-G");
    expect(g.trigger({ status: "materialised" }, "update")).toBe(true);
    expect(g.trigger({ status: "mitigated" }, "update")).toBe(false);
  });

  it("write-effect rules seed as drafts; advisories seed active (D-4)", () => {
    const byCode = new Map(CASCADE_RULE_SEEDS.map((s) => [s.ruleCode, s]));
    for (const code of ["CASCADE-D", "CASCADE-F", "CASCADE-G"]) {
      expect(byCode.get(code)!.isActive, code).toBe(false);
    }
    for (const code of ["CASCADE-A", "CASCADE-B", "CASCADE-C", "CASCADE-E"]) {
      expect(byCode.get(code)!.isActive, code).toBe(true);
    }
  });

  it("seed trigger contexts never match generic applyRules contexts", () => {
    // Trigger_Context {cascade: CODE} only matches a context that carries the
    // cascade key — applyRules calls from assessments never do.
    for (const s of CASCADE_RULE_SEEDS) {
      const trigger = JSON.parse(s.triggerCondition) as Record<string, string>;
      expect(Object.keys(trigger)).toEqual(["cascade"]);
    }
  });
});
