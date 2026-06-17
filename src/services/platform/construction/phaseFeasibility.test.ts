import { describe, it, expect, beforeAll } from "vitest";
import { checkPhaseFeasibility } from "./phaseFeasibility";

// Force the offline heuristic path so the test is deterministic and never
// reaches the real model (callClaude returns demo mode when no key is set).
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("checkPhaseFeasibility (offline heuristic)", () => {
  it("flags a whole new house compressed into a single week as unrealistic", async () => {
    const res = await checkPhaseFeasibility(
      [
        { name: "Slab", weeks: 1 },
        { name: "Frame", weeks: 0 },
        { name: "Lock-up", weeks: 0 },
        { name: "Fit-out & handover", weeks: 0 },
      ],
      { categoryLabel: "New home build", engagementType: "fixed_price" },
    );
    expect(res.verdict).toBe("unrealistic");
    expect(res.issues.some((i) => i.phase === "Overall")).toBe(true);
    expect(res.demo).toBe(true);
  });

  it("accepts a sensibly-timed plan", async () => {
    const res = await checkPhaseFeasibility(
      [
        { name: "Site establishment", weeks: 2 },
        { name: "Structure", weeks: 8 },
        { name: "Services & finishes", weeks: 8 },
        { name: "Handover", weeks: 2 },
      ],
      { categoryLabel: "New home build" },
    );
    expect(res.verdict).toBe("ok");
    expect(res.issues).toHaveLength(0);
  });

  it("flags zero-week phases and offers a corrected plan", async () => {
    const res = await checkPhaseFeasibility(
      [
        { name: "Inspection & measure", weeks: 1 },
        { name: "Strip existing roof", weeks: 0 },
      ],
      { categoryLabel: "Roof replacement / re-roof" },
    );
    expect(res.issues.some((i) => i.phase === "Strip existing roof")).toBe(true);
    expect(res.suggestedPlan?.find((p) => p.name === "Strip existing roof")?.weeks).toBe(1);
  });

  it("returns unrealistic when no named phases are supplied", async () => {
    const res = await checkPhaseFeasibility([{ name: "  ", weeks: 1 }], {});
    expect(res.verdict).toBe("unrealistic");
  });
});
