// Force-to-review invariants (§5.2 rule 3): canonical passes untouched,
// case-only variants normalize, anything else lands on the review-default —
// and non-governed fields are never touched.

import { describe, expect, it } from "vitest";
import { enforceVocab } from "./vocab";

describe("enforceVocab", () => {
  it("passes canonical values untouched", () => {
    const fields = { Status: "Blocked", Priority: "High" };
    expect(enforceVocab("ISSUES", fields)).toEqual([]);
    expect(fields).toEqual({ Status: "Blocked", Priority: "High" });
  });

  it("normalizes case-only variants to canonical casing", () => {
    const fields = { Action_Type: "create", Status: "done" };
    const c = enforceVocab("EXECUTION_LOG", fields);
    expect(fields).toEqual({ Action_Type: "Create", Status: "Done" });
    expect(c).toHaveLength(2);
  });

  it("forces unknown values to the review-default, reporting the coercion", () => {
    const fields = { Status: "Ordered" };
    const c = enforceVocab("PROCUREMENT", fields);
    expect(fields.Status).toBe("Selection Required");
    expect(c).toEqual([{ field: "Status", from: "Ordered", to: "Selection Required" }]);
  });

  it("ignores non-governed tables/fields and non-string cells", () => {
    const fields = { Status: "anything goes", Amount: 5 };
    expect(enforceVocab("QUOTES", fields)).toEqual([]);
    const risk = { Status: "open", Likelihood: 3 };
    expect(enforceVocab("RISKS", risk)).toEqual([]); // §5.4 empty-defined, not yet enumerated
  });

  it("keeps the app's CHANGE_LOG variation states (pending D1 amendment)", () => {
    const fields = { Status: "Pending", Change_Type: "Variation" };
    expect(enforceVocab("CHANGE_LOG", fields)).toEqual([]);
  });
});
