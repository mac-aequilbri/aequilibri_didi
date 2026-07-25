import { describe, expect, it } from "vitest";
import {
  demotedLevel,
  ladderAfterEvent,
  parseApplicationWindow,
  parseOverrideLevel,
  relaxEligible,
  serializeApplicationWindow,
} from "./learning";

describe("Override_Permission governance ladder (Spec 12 Module 6)", () => {
  it("parses stored levels and falls back from the legacy checkbox", () => {
    expect(parseOverrideLevel("Owner_Only", false)).toBe("owner_only");
    expect(parseOverrideLevel("Standard", true)).toBe("standard");
    expect(parseOverrideLevel("advisory", false)).toBe("advisory");
    expect(parseOverrideLevel(undefined, true)).toBe("owner_only"); // cannotOverride
    expect(parseOverrideLevel(undefined, false)).toBe("standard"); // legacy default
  });

  it("window round-trips as 0/1 JSON capped at 10", () => {
    const win = [true, false, true];
    expect(parseApplicationWindow(serializeApplicationWindow(win))).toEqual(win);
    expect(parseApplicationWindow(serializeApplicationWindow(Array(15).fill(true)))).toHaveLength(10);
    expect(parseApplicationWindow("not json")).toEqual([]);
    expect(parseApplicationWindow(undefined)).toEqual([]);
  });

  it("demotes one level: Standard → Owner_Only → Advisory, never deleted", () => {
    expect(demotedLevel("standard")).toBe("owner_only");
    expect(demotedLevel("owner_only")).toBe("advisory");
  });

  it("demotes when overrides in the last 10 exceed 3", () => {
    // 3 prior overrides in window; the 4th triggers demotion.
    const window = [true, false, true, false, true, false, true, true, true];
    const clean = ladderAfterEvent("standard", window, true);
    expect(clean.demoted).toBe(false);
    const overridden = ladderAfterEvent("standard", window, false);
    expect(overridden.demoted).toBe(true);
    expect(overridden.level).toBe("owner_only");
  });

  it("old events roll out of the 10-application window", () => {
    // 3 overrides but the oldest rolls off when the new override pushes in:
    // still 3-in-10 after the push? [F,F,F,T,T,T,T,T,T,T] + F → drops lead F →
    // [F,F,T,T,T,T,T,T,T,F] = 3 overrides → not > 3 → no demotion.
    const window = [false, false, false, true, true, true, true, true, true, true];
    const res = ladderAfterEvent("standard", window, false);
    expect(res.window).toHaveLength(10);
    expect(res.demoted).toBe(false);
  });

  it("advisory rules never demote further", () => {
    const res = ladderAfterEvent("advisory", Array(10).fill(false), false);
    expect(res.level).toBe("advisory");
    expect(res.demoted).toBe(false);
  });

  it("relax suggestion needs Owner_Only + 10 clean applications", () => {
    expect(relaxEligible("owner_only", Array(10).fill(true))).toBe(true);
    expect(relaxEligible("owner_only", Array(9).fill(true))).toBe(false);
    expect(relaxEligible("owner_only", [...Array(9).fill(true), false])).toBe(false);
    expect(relaxEligible("standard", Array(10).fill(true))).toBe(false);
  });
});
