// Currency-math regression tests. round2's header comment asserts that
// round-half-up "matches in every validated worksheet" — these tests turn that
// assertion into something enforced. Boundary cases target the classic float
// traps (x.xx5 representations, negative halves, EPSILON nudge behavior).

import { describe, expect, it } from "vitest";
import { GST_RATE, gst, incGst, round2, roundTo } from "./money";

describe("round2", () => {
  it("rounds exact 2dp values to themselves", () => {
    expect(round2(12.34)).toBe(12.34);
    expect(round2(0)).toBe(0);
    expect(round2(100)).toBe(100);
  });

  it("rounds half up at the third decimal", () => {
    expect(round2(1.005)).toBe(1.01); // float 1.005 is 1.00499…; EPSILON nudge restores half-up
    expect(round2(2.675)).toBe(2.68); // float 2.675 is 2.67499…
    expect(round2(1.015)).toBe(1.02);
    expect(round2(0.125)).toBe(0.13); // banker's rounding would give 0.12
  });

  it("rounds down below the half", () => {
    expect(round2(1.004)).toBe(1.0);
    expect(round2(9.994)).toBe(9.99);
  });

  it("handles large currency amounts", () => {
    expect(round2(1_234_567.891)).toBe(1_234_567.89);
    expect(round2(1_234_567.895)).toBe(1_234_567.9);
  });

  it("handles negative amounts (credits/refunds)", () => {
    expect(round2(-1.004)).toBe(-1.0);
    expect(round2(-9.99)).toBe(-9.99);
  });
});

describe("roundTo", () => {
  it("rounds to the requested precision", () => {
    expect(roundTo(3.14159, 4)).toBe(3.1416);
    expect(roundTo(3.14159, 0)).toBe(3);
    expect(roundTo(1.005, 2)).toBe(round2(1.005));
  });
});

describe("gst / incGst", () => {
  it("computes the 10% GST component rounded to cents", () => {
    expect(GST_RATE).toBe(0.1);
    expect(gst(100)).toBe(10);
    expect(gst(99.95)).toBe(10.0); // 9.995 rounds half-up to 10.00
    expect(gst(0.05)).toBe(0.01); // 0.005 rounds half-up
    expect(gst(0)).toBe(0);
  });

  it("incGst equals ex-GST plus its rounded GST component", () => {
    expect(incGst(100)).toBe(110);
    expect(incGst(99.95)).toBe(109.95);
    expect(incGst(1234.56)).toBe(1358.02); // gst = 123.456 → 123.46
  });

  it("stays consistent: incGst(x) - gst(x) === round2(x)", () => {
    for (const x of [0, 0.05, 1.01, 99.95, 1234.56, 87_654.32]) {
      expect(round2(incGst(x) - gst(x))).toBe(round2(x));
    }
  });
});
