import { describe, it, expect } from "vitest";
import { normalizeAddressKey, toFloat, distanceM } from "./correctionMemory";

describe("correctionMemory helpers", () => {
  it("normalizes addresses to lowercase alphanumerics", () => {
    expect(normalizeAddressKey("11 Condron Place, AYR QLD 4807")).toBe("11condronplaceayrqld4807");
    expect(normalizeAddressKey(null)).toBe("");
  });

  it("coerces floats safely", () => {
    expect(toFloat("12.5")).toBe(12.5);
    expect(toFloat("")).toBeNull();
    expect(toFloat(null)).toBeNull();
    expect(toFloat("abc")).toBeNull();
  });

  it("computes haversine distance and guards nulls", () => {
    // ~111 km between 1° of latitude.
    const d = distanceM(0, 0, 1, 0)!;
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
    expect(distanceM(null, 0, 1, 0)).toBeNull();
    expect(distanceM(0, 0, 0, 0)).toBe(0);
  });
});
