import { describe, expect, it } from "vitest";
import { FIELD_MAPS, airtableMapFor, toFields } from "./fieldMaps";

describe("fieldMaps", () => {
  it("maps a decision create with the canonical status enum + derived name", () => {
    const m = airtableMapFor("decision")!;
    const f = toFields(m, { description: "Use slate tiles", rationale: "durability", status: "confirmed" }, "create");
    expect(f).toMatchObject({
      Decision_Name: "Use slate tiles",
      Decision_Description: "Use slate tiles",
      Rationale: "durability",
      Status: "Made", // confirmed -> Made
    });
  });

  it("partial update emits only the provided fields", () => {
    const m = airtableMapFor("decision")!;
    const f = toFields(m, { status: "superseded" }, "update");
    expect(f).toEqual({ Status: "Reversed" });
    expect(f).not.toHaveProperty("Decision_Description");
  });

  it("applies create defaults for omitted status fields", () => {
    const m = airtableMapFor("risk")!;
    const f = toFields(m, { description: "scope creep", likelihood: "4", impact: "5" }, "create");
    expect(f).toMatchObject({ Risk: "scope creep", Likelihood: 4, Impact: 5, Status: "open" });
  });

  it("never sends a non-rec id as a linked record", () => {
    const m = airtableMapFor("quote_line")!;
    const numeric = toFields(m, { description: "Demolition", quoteId: 42, qty: 1, unitPrice: 100 }, "create");
    expect(numeric).not.toHaveProperty("Quote"); // 42 is a Postgres id, not "rec…"
    const air = toFields(m, { description: "Demolition", quoteId: "rec123", qty: 1, unitPrice: 100 }, "create");
    expect(air.Quote).toEqual(["rec123"]);
  });

  it("coerces booleans and numbers from form strings", () => {
    const m = airtableMapFor("weekly_report")!;
    const f = toFields(m, { title: "Wk 1", isAiGenerated: "true", status: "draft" }, "create");
    expect(f.Is_AI_Generated).toBe(true);
  });

  it("every map targets a table that exists in the generated schema", async () => {
    const { CORE_SCHEMA } = await import("./schema.generated");
    for (const [key, map] of Object.entries(FIELD_MAPS)) {
      expect(CORE_SCHEMA, `map ${key} -> ${map.table}`).toHaveProperty(map.table);
    }
  });
});
