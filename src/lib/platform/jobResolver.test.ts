import { describe, expect, it } from "vitest";
import { matchJobByName, type JobCandidate } from "./jobResolver";

// The four Sunridge projects, plus a General bucket — the shape the resolver
// actually sees in production.
const SUNRIDGE: JobCandidate[] = [
  { id: "rec1", name: "Maleny Ridge House" },
  { id: "rec2", name: "Kenilworth Cabin" },
  { id: "rec3", name: "Palmwoods Duplex" },
  { id: "rec4", name: "General" },
];

describe("matchJobByName — full-name matches", () => {
  it("matches a project named in full, anywhere in the text", () => {
    const r = matchJobByName(SUNRIDGE, "Please confirm the frame inspection for Maleny Ridge House.");
    expect(r.match?.candidate.id).toBe("rec1");
    expect(r.match?.confidence).toBeGreaterThan(0.9);
  });

  it("ignores case and punctuation", () => {
    expect(matchJobByName(SUNRIDGE, "re: MALENY-RIDGE-HOUSE").match?.candidate.id).toBe("rec1");
  });
});

describe("matchJobByName — partial matches", () => {
  it("matches on distinctive words alone", () => {
    // "Maleny Ridge" → "Maleny Ridge House": both distinctive tokens present.
    const r = matchJobByName(SUNRIDGE, "the plasterboard order for Maleny Ridge is due Friday");
    expect(r.match?.candidate.id).toBe("rec1");
    expect(r.match?.confidence).toBeLessThan(0.9);
    expect(r.match?.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("does not match on a generic word shared by every project", () => {
    // "House" alone is generic — it must not pull in Maleny Ridge House.
    expect(matchJobByName(SUNRIDGE, "the house needs a new door").match).toBeUndefined();
  });

  it("requires most of a multi-word name, not just one word", () => {
    // "Kenilworth" alone is 1 of 2 distinctive tokens = 50% coverage.
    expect(matchJobByName(SUNRIDGE, "invoice from Kenilworth Plumbing Supplies").match).toBeUndefined();
  });
});

describe("matchJobByName — refusing to guess", () => {
  it("returns nothing when no project is named", () => {
    const r = matchJobByName(SUNRIDGE, "order 40 sheets of plasterboard by Friday");
    expect(r.match).toBeUndefined();
    expect(r.ambiguous).toBeUndefined();
  });

  it("never matches a project the text does not mention", () => {
    // The demo email's "Riverside" is not a Sunridge project — attaching it to
    // one anyway is the single worst failure mode this module can have.
    expect(matchJobByName(SUNRIDGE, "order plasterboard for the Riverside job").match).toBeUndefined();
  });

  it("reports ambiguity instead of picking between equal matches", () => {
    const twins: JobCandidate[] = [
      { id: "recA", name: "Riverside Stage 1" },
      { id: "recB", name: "Riverside Stage 2" },
    ];
    const r = matchJobByName(twins, "an update on Riverside");
    expect(r.match).toBeUndefined();
    expect(r.ambiguous?.map((c) => c.id).sort()).toEqual(["recA", "recB"]);
  });

  it("never matches the General bucket by name", () => {
    // General is the explicit last resort, never something text can select.
    expect(matchJobByName(SUNRIDGE, "a general question about the general works").match).toBeUndefined();
  });

  it("handles empty text and an empty project list", () => {
    expect(matchJobByName(SUNRIDGE, "").match).toBeUndefined();
    expect(matchJobByName([], "Maleny Ridge House").match).toBeUndefined();
    expect(matchJobByName([{ id: "r", name: "" }], "anything").match).toBeUndefined();
  });
});

describe("matchJobByName — single-word project names", () => {
  const single: JobCandidate[] = [{ id: "rec9", name: "Woodlands" }];

  it("matches a distinctive single-word name in full", () => {
    expect(matchJobByName(single, "site meeting at Woodlands on Tuesday").match?.candidate.id).toBe("rec9");
  });

  it("scores a partial name below a whole one", () => {
    // Part of a name is weaker evidence than all of it, whatever the length.
    const whole = matchJobByName(single, "Woodlands update").match?.confidence ?? 0;
    const part = matchJobByName(SUNRIDGE, "Maleny Ridge update").match?.confidence ?? 0;
    expect(part).toBeLessThan(whole);
  });

  it("does not match on a substring of a longer word", () => {
    expect(matchJobByName(single, "the woodlandsville site").match).toBeUndefined();
  });
});
