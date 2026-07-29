import { describe, expect, it } from "vitest";
import { proposalJobId, proposalSourceOf, strategyLabel } from "./proposalSource";

describe("proposalJobId — column wins, payload is the fallback", () => {
  const payload = JSON.stringify({ jobId: "recFromPayload", title: "x" });

  it("prefers the column when it is populated", () => {
    expect(proposalJobId("recFromColumn", payload)).toBe("recFromColumn");
  });

  it("falls back to the payload when the column is blank", () => {
    // Proposals raised before the writer persisted Airtable ids left it "".
    expect(proposalJobId("", payload)).toBe("recFromPayload");
    expect(proposalJobId(null, payload)).toBe("recFromPayload");
    expect(proposalJobId(undefined, payload)).toBe("recFromPayload");
  });

  it("stringifies a Postgres integer id from either source", () => {
    expect(proposalJobId(42, "{}")).toBe("42");
    expect(proposalJobId(null, JSON.stringify({ jobId: 42 }))).toBe("42");
  });

  it("is null when neither source has a project (org-global proposal)", () => {
    expect(proposalJobId("", "{}")).toBeNull();
    expect(proposalJobId(null, JSON.stringify({ jobId: "" }))).toBeNull();
    expect(proposalJobId(null, JSON.stringify({ jobId: null }))).toBeNull();
  });

  it("never throws on a malformed payload", () => {
    expect(proposalJobId(null, "not json")).toBeNull();
    expect(proposalJobId("recX", "not json")).toBe("recX");
  });
});

describe("proposalSourceOf", () => {
  it("reads provenance written by the ingestion path", () => {
    const payload = JSON.stringify({
      jobId: "rec1",
      title: "Order plasterboard",
      __source: {
        jobName: "Maleny Ridge House",
        strategy: "name",
        confidence: 0.85,
        unassigned: false,
        subject: "Plasterboard order",
        channel: "email",
        evidence: "Please order 40 sheets by Friday.",
      },
    });
    expect(proposalSourceOf(payload)).toEqual({
      jobName: "Maleny Ridge House",
      strategy: "name",
      confidence: 0.85,
      unassigned: false,
      subject: "Plasterboard order",
      channel: "email",
      evidence: "Please order 40 sheets by Friday.",
    });
  });

  it("returns null for a proposal that did not come from a message", () => {
    expect(proposalSourceOf(JSON.stringify({ jobId: 1, title: "manual" }))).toBeNull();
    expect(proposalSourceOf("not json")).toBeNull();
    expect(proposalSourceOf(JSON.stringify({ __source: "nonsense" }))).toBeNull();
  });

  it("tolerates a partial __source without inventing values", () => {
    const s = proposalSourceOf(JSON.stringify({ __source: { unassigned: true } }));
    expect(s).toMatchObject({ strategy: "none", confidence: 0, unassigned: true, evidence: "" });
    expect(s?.jobName).toBeUndefined();
  });
});

describe("strategyLabel", () => {
  it("gives every strategy a reviewer-facing phrase", () => {
    const all = ["explicit", "name", "sender", "single_job", "general", "none"] as const;
    for (const s of all) expect(strategyLabel(s).length).toBeGreaterThan(0);
  });

  it("says plainly when nothing was identified", () => {
    expect(strategyLabel("general")).toContain("General");
  });
});
