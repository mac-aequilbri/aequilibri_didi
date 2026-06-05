import { describe, it, expect } from "vitest";
import { buildPortCityQuote, taperedRoofBreakdown, type QuoteInputs } from "./pricing";

// Ported from uc1_roofing/tests_pricing_port_city.py — the 5 historical Port City
// worksheets. Tolerance <1 matches the Python validation harness.
interface Case {
  label: string;
  internal: number;
  quoted: number;
  gutter: number;
  inputs: QuoteInputs;
}

const CASES: Case[] = [
  {
    label: "#593 11 Condron Place AYR",
    internal: 23485,
    quoted: 25833.5,
    gutter: 2900,
    inputs: {
      roofType: "gable",
      roofAreaM2: 171,
      eaveLm: 35,
      suburb: "Ayr",
      travelDaysOverride: 3,
      includeFusePull: true,
      includeBins: false,
      includeGutters: true,
      gutterLm: 23,
      gutterTravelDays: 1,
    },
  },
  {
    label: "4 The Esplanade TOOMULLA",
    internal: 16370,
    quoted: 18007,
    gutter: 4100,
    inputs: {
      roofType: "ultra_gable",
      roofAreaM2: 105,
      eaveLm: 30,
      suburb: "Toomulla",
      travelDaysOverride: 1,
      includeFusePull: true,
      includeBins: false,
      includeGutters: true,
      gutterLm: 31,
      downpipe90mm: 4,
    },
  },
  {
    label: "30 Estate Street WEST END",
    internal: 19234,
    quoted: 21157.4,
    gutter: 4000,
    inputs: {
      roofType: "hip",
      roofAreaM2: 125,
      eaveLm: 36,
      suburb: "West End",
      includeFusePull: true,
      includeBins: false,
      solarHwRr: true,
      includeGutters: true,
      gutterLm: 40,
    },
  },
  {
    label: "112 Abbott Street OONOONBA",
    internal: 28273,
    quoted: 31100.3,
    gutter: 6500,
    inputs: {
      roofType: "hip",
      roofAreaM2: 180,
      eaveLm: 45,
      suburb: "Oonoonba",
      includeFusePull: true,
      includeBins: false,
      solarPanelsRr: 18,
      isHighset: true,
      boxGutterLump: 1000,
      includeGutters: true,
      gutterLm: 65,
    },
  },
  {
    label: "14 Calliandra Court MT LOUISA",
    internal: 45910,
    quoted: 50501,
    gutter: 0,
    inputs: {
      roofType: "hip",
      roofAreaM2: 340,
      eaveLm: 90,
      suburb: "Mt Louisa",
      includeFusePull: false,
      includeBins: false,
    },
  },
];

describe("Port City pricing — historical worksheets", () => {
  for (const c of CASES) {
    it(c.label, () => {
      const d = buildPortCityQuote(c.inputs).toDict();
      expect(Math.abs(d.internal_subtotal - c.internal)).toBeLessThan(1);
      expect(Math.abs(d.quoted_ex_gst - c.quoted)).toBeLessThan(1);
      expect(Math.abs(d.gutter_subtotal - c.gutter)).toBeLessThan(1);
    });
  }
});

describe("tapered roof breakdown", () => {
  it("splits 450 m² into 4 bands", () => {
    const bands = taperedRoofBreakdown(450);
    expect(bands).toHaveLength(4);
    expect(bands[0]).toMatchObject({ start: 0, end: 100, rate: 145, m2: 100 });
    expect(bands[3]).toMatchObject({ start: 400, end: 450, rate: 115, m2: 50 });
  });

  it("returns empty for zero area", () => {
    expect(taperedRoofBreakdown(0)).toHaveLength(0);
  });
});
