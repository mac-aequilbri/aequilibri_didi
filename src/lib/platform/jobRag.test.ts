import { describe, expect, it } from "vitest";
import { computeJobRag } from "./jobRag";

describe("computeJobRag", () => {
  it("returns no signal when no phase carries a RAG", () => {
    expect(computeJobRag([])).toBe("");
    expect(computeJobRag(["", "  ", "unknown"])).toBe("");
  });

  it("is Green only when phases report and none are Amber/Red", () => {
    expect(computeJobRag(["Green", "green", "G"])).toBe("Green");
  });

  it("floors at Amber for any Amber phase or a single Red phase", () => {
    expect(computeJobRag(["Green", "Amber"])).toBe("Amber");
    expect(computeJobRag(["Green", "Red"])).toBe("Amber"); // one red ≠ engagement red
  });

  it("escalates to Red at 2+ red phases", () => {
    expect(computeJobRag(["Red", "Red", "Green"])).toBe("Red");
  });

  it("open blockers floor the engagement at Amber and turn 1 red into Red", () => {
    expect(computeJobRag([], 1)).toBe("Amber");
    expect(computeJobRag(["Green"], 2)).toBe("Amber");
    expect(computeJobRag(["Red"], 1)).toBe("Red");
  });

  it("tolerates raw cell casing and shorthand", () => {
    expect(computeJobRag(["r", "RED"])).toBe("Red");
    expect(computeJobRag(["a"])).toBe("Amber");
  });
});
