// The aiAuthority policy matrix is the platform's core write-safety
// mechanism — it decides whether an AI tool call executes immediately or
// waits in the approval queue. Test it exhaustively.

import { describe, expect, it } from "vitest";
import { WRITABLE_TABLES } from "@/lib/platform/recordWriter";
import { requiresApproval } from "./executor";
import { ASSISTANT_TOOLS, roleCanUseTool, TOOL_POLICY } from "./tools";

describe("aiAuthority policy matrix", () => {
  it("reads never require approval", () => {
    for (const authority of ["propose_only", "approve_required", "auto_low_risk"] as const) {
      expect(requiresApproval(authority, "read")).toBe(false);
    }
  });

  it("propose_only and approve_required gate every write", () => {
    for (const authority of ["propose_only", "approve_required"] as const) {
      expect(requiresApproval(authority, "low_write")).toBe(true);
      expect(requiresApproval(authority, "high_write")).toBe(true);
    }
  });

  it("auto_low_risk executes low-risk writes but gates high-risk", () => {
    expect(requiresApproval("auto_low_risk", "low_write")).toBe(false);
    expect(requiresApproval("auto_low_risk", "high_write")).toBe(true);
  });

  it("unknown authority values fail safe (gate everything)", () => {
    expect(requiresApproval("garbage" as never, "low_write")).toBe(true);
    expect(requiresApproval("" as never, "high_write")).toBe(true);
  });
});

describe("tool policy registry consistency", () => {
  it("every assistant tool has a policy entry", () => {
    for (const tool of ASSISTANT_TOOLS) {
      expect(TOOL_POLICY[tool.name], `missing policy for ${tool.name}`).toBeDefined();
    }
  });

  it("every write tool maps to a registered writable table", () => {
    for (const [name, policy] of Object.entries(TOOL_POLICY)) {
      if (policy.risk === "read") continue;
      expect(policy.table, `${name} has no table`).toBeDefined();
      expect(WRITABLE_TABLES, `${name} → unknown table ${policy.table}`).toContain(policy.table);
      expect(["create", "update"]).toContain(policy.op);
    }
  });

  it("rule proposals are always high-risk (prompt-injection reach)", () => {
    expect(TOOL_POLICY.propose_rule.risk).toBe("high_write");
  });
});

describe("assistant role-scoped access", () => {
  it("broker role can read but cannot write", () => {
    expect(roleCanUseTool("broker", "query_records")).toBe(true);
    expect(roleCanUseTool("broker", "create_action")).toBe(false);
    expect(roleCanUseTool("broker", "update_budget_line")).toBe(false);
  });

  it("owner/builder/architect roles can use write tools", () => {
    for (const role of ["owner", "builder", "architect"]) {
      expect(roleCanUseTool(role, "create_action")).toBe(true);
      expect(roleCanUseTool(role, "save_decision")).toBe(true);
    }
  });
});
