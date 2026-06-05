// Quality scoring for roof-analysis results — port of services/roof_quality.py.
// Every signal key ending in `_ok` is a boolean that feeds the aggregate score.

import { polygonAreaPct, convexHullAreaPct } from "@/lib/geometry";

export interface QualityResult {
  signals: Record<string, number | boolean>;
  quality_score: number | null;
  needs_review: boolean;
}

interface RoofResult {
  roof_outline?: number[][];
  sections?: { polygon?: number[][] }[];
}

interface GeoscapeLike {
  buildingArea?: number;
  building_area?: number;
  area_sqm?: number;
}

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

export function computeQualityScore(
  result: RoofResult | null,
  geoscape: GeoscapeLike | null = null,
  imageDims: [number, number] = [640, 640],
  metersPerPixelVal: number | null = null,
): QualityResult {
  const signals: Record<string, number | boolean> = {};

  const outlinePct = result?.roof_outline ?? [];
  if (!Array.isArray(outlinePct) || outlinePct.length < 3) {
    return { signals: { degenerate_outline: true }, quality_score: 0, needs_review: true };
  }

  const [w, h] = imageDims;

  // 1. Vertex count
  const nVerts = outlinePct.length;
  signals.vertex_count = nVerts;
  signals.vertex_count_ok = nVerts >= 4 && nVerts <= 20;

  // 2. Convexity
  const polyAreaPct = polygonAreaPct(outlinePct);
  const hullAreaPct = convexHullAreaPct(outlinePct);
  const convexity = hullAreaPct > 0 ? polyAreaPct / hullAreaPct : 0;
  signals.convexity = round(convexity, 3);
  signals.convexity_ok = convexity > 0.8;

  // 3. Detected area vs Geoscape building area
  if (metersPerPixelVal && metersPerPixelVal > 0) {
    const polyAreaPx = (polyAreaPct * w * h) / (100 * 100);
    const detectedAreaM2 = polyAreaPx * metersPerPixelVal ** 2;
    signals.detected_area_m2 = round(detectedAreaM2, 1);

    const buildingArea =
      geoscape?.buildingArea ?? geoscape?.building_area ?? geoscape?.area_sqm ?? null;
    if (buildingArea) {
      const ratio = detectedAreaM2 / Number(buildingArea);
      if (Number.isFinite(ratio)) {
        signals.expected_area_m2 = Number(buildingArea);
        signals.area_ratio = round(ratio, 3);
        signals.area_ratio_ok = ratio >= 0.85 && ratio <= 1.15;
      }
    }
  }

  // 4. Section count
  const sections = result?.sections ?? [];
  const nSections = sections.length;
  signals.section_count = nSections;
  signals.section_count_ok = nSections >= 1 && nSections <= 12;

  // 5. Section coverage of the outline
  if (nSections > 0 && polyAreaPct > 0) {
    const totalSectionArea = sections.reduce((s, sec) => s + polygonAreaPct(sec.polygon ?? []), 0);
    const coverage = totalSectionArea / polyAreaPct;
    signals.section_coverage = round(coverage, 3);
    signals.section_coverage_ok = coverage >= 0.85 && coverage <= 1.15;
  }

  // Aggregate
  const okFlags = Object.entries(signals)
    .filter(([k, v]) => k.endsWith("_ok") && typeof v === "boolean")
    .map(([, v]) => v as boolean);
  const quality = okFlags.length
    ? round(okFlags.filter(Boolean).length / okFlags.length, 3)
    : null;

  return {
    signals,
    quality_score: quality,
    needs_review: quality !== null && quality < 0.7,
  };
}

export interface QualityBadge {
  label: string;
  colour: string;
  background: string;
}

export function qualityBadgeForScore(score: number | null): QualityBadge {
  if (score === null) return { label: "no score", colour: "#888", background: "#f4f4f4" };
  if (score >= 0.85) return { label: `Quality ${score.toFixed(2)}`, colour: "#1b5e20", background: "#e8f5e9" };
  if (score >= 0.7) return { label: `Quality ${score.toFixed(2)}`, colour: "#e65100", background: "#fff3e0" };
  return { label: `Review ${score.toFixed(2)}`, colour: "#b71c1c", background: "#ffebee" };
}
