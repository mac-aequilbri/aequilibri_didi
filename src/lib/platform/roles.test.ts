// §2.2 permission-matrix invariants: sub-role parsing, write/approve rights,
// CLS finance visibility, and RLS exemptions.

import { describe, expect, it } from "vitest";
import { normalizeTeamRole } from "./module1Governance";
import { canApprove, canWrite, financeVisible, frameworkRoleLabel, normalizeRoleString, parseRole, rlsExempt } from "./roles";

describe("parseRole", () => {
  it("parses composite roles and drops unknown suffixes", () => {
    expect(parseRole("builder+finance")).toMatchObject({ base: "builder", canonical: "builder+finance" });
    expect(parseRole("Broker+Auditor").canonical).toBe("broker+auditor");
    expect(parseRole("builder+bogus").canonical).toBe("builder");
    expect(normalizeRoleString("admin")).toBe("owner"); // legacy base still maps
  });

  it("keeps base-role helpers composite-safe", () => {
    expect(normalizeTeamRole("builder+finance")).toBe("builder"); // not "broker"
  });

  it("maps to framework display names (D5)", () => {
    expect(frameworkRoleLabel("owner")).toBe("Administrator");
    expect(frameworkRoleLabel("builder+finance")).toBe("Finance Manager");
    expect(frameworkRoleLabel("broker+auditor")).toBe("Auditor");
  });
});

describe("canWrite (§2.2 matrix)", () => {
  it("financial + learning-rule tables are owner-only", () => {
    for (const t of ["budget_line", "cashflow", "learning_rule"]) {
      expect(canWrite("owner", t, "update")).toBe(true);
      expect(canWrite("builder+finance", t, "update")).toBe(false);
      expect(canWrite("architect", t, "create")).toBe(false);
    }
  });

  it("Contributor can CRU issues/risks/decisions but not jobs; Viewer nothing", () => {
    expect(canWrite("architect", "action", "create")).toBe(true);
    expect(canWrite("architect", "risk", "update")).toBe(true);
    expect(canWrite("architect", "job", "update")).toBe(false);
    expect(canWrite("builder", "job", "update")).toBe(true);
    expect(canWrite("broker", "action", "create")).toBe(false);
    expect(canWrite("broker+auditor", "action", "update")).toBe(false);
  });

  it("delete on governed tables is Administrator-only", () => {
    expect(canWrite("builder", "action", "delete")).toBe(false);
    expect(canWrite("owner", "action", "delete")).toBe(true);
    expect(canWrite("builder", "vendor", "delete")).toBe(true); // unlisted: legacy rule
  });
});

describe("canApprove (§2.2 Approve column)", () => {
  it("financial approvals need Owner or Finance Manager", () => {
    expect(canApprove("builder", "procurement")).toBe(false);
    expect(canApprove("builder+finance", "procurement")).toBe(true);
    expect(canApprove("builder+finance", "cashflow")).toBe(true);
    expect(canApprove("owner", "budget_line")).toBe(true);
  });

  it("learning rules are Administrator-only; Contributor/Viewer never approve", () => {
    expect(canApprove("builder+finance", "learning_rule")).toBe(false);
    expect(canApprove("owner", "learning_rule")).toBe(true);
    expect(canApprove("architect", "action")).toBe(false);
    expect(canApprove("broker+auditor", "action")).toBe(false);
    expect(canApprove("builder", "action")).toBe(true);
  });
});

describe("CLS + RLS helpers", () => {
  it("finance visibility: Owner, Finance Manager, Auditor", () => {
    expect(financeVisible("owner")).toBe(true);
    expect(financeVisible("builder+finance")).toBe(true);
    expect(financeVisible("broker+auditor")).toBe(true);
    expect(financeVisible("builder")).toBe(false);
  });

  it("RLS exemption: Administrator, Auditor, Business Owner", () => {
    expect(rlsExempt("owner")).toBe(true);
    expect(rlsExempt("broker+auditor")).toBe(true);
    expect(rlsExempt("builder+business_owner")).toBe(true);
    expect(rlsExempt("builder+finance")).toBe(false);
  });
});
