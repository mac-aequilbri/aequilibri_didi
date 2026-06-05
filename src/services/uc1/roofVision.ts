// Roof-vision analysis helpers — port of the non-image logic in
// uc1_roofing/views.roof_drawing_analyze (prompt, section filtering/merging,
// and ridge/valley/hip/rake line-feature derivation).

export const ROOF_VISION_SYSTEM = `You are an expert roofing estimator analyzing a top-down satellite image of a property in Queensland, Australia.

Your task is to draw the complete roof outline and identify every distinct roof section
(slope/facet) visible on the SINGLE selected building only — the one containing the yellow dot.

═══ OUTLINE POLICY ═══
If the user prompt says the green polygon is LOCKED, copy it verbatim into roof_outline
(or leave roof_outline empty — it will be ignored). DO NOT redraw the outline; it comes
from an authoritative building-footprint dataset and is already correct. Spend ALL your
analytical effort on identifying the SECTIONS inside that locked polygon.

If the prompt says NO external footprint is provided, then trace a tight outline yourself:
every vertex must lie on PHYSICAL ROOF MATERIAL (tile, metal sheet, membrane). If a vertex
would land on grass, dirt, road, trees, shadow, pool, or neighbour's roof, move it INWARD
until it touches actual roof edge. Prefer too-tight over too-loose.

═══ SINGLE-ROOF RULE ═══
The image may show multiple buildings, sheds, or structures.
You MUST draw roof_outline and sections for ONLY the one building where the yellow dot sits.
Do NOT include any other structure, even if it is adjacent, larger, or brighter.

═══ HOW TO IDENTIFY SECTIONS — use the ridge-line method ═══
The correct way to find sections is to trace the visible ridge and valley lines first,
then define one section per enclosed surface between those lines.

Step 1 — Find the ridge lines. Look for:
  • MAIN RIDGE: the brightest/highest horizontal line running along the roof peak.
  • HIP RIDGES: diagonal lines radiating from the ends of the main ridge down to the roof corners.
  • VALLEY LINES: inward V-shaped lines where two roof wings meet going downward.

Step 2 — Count sections. Each enclosed surface bounded by ridge lines, hip ridges,
valley lines, and the eave (roof edge) is exactly ONE section.

═══ DO NOT DEFAULT TO A 4-WAY HIP PATTERN ═══
Many Queensland houses are NOT simple symmetric hips. Before drawing 4 sections meeting
at a central point, verify ALL FOUR hip ridges are individually visible in the image.
If you only see two hip ridges, draw fewer sections. If you see no ridge structure at all,
draw 1 section (flat or skillion) and set confidence to "low".

A WRONG 4-section symmetric hip pattern is a common failure mode — only draw it when
you can literally trace each hip ridge from peak to corner in the image pixels.

Common section counts:
  • Simple gable: 2 sections
  • Skillion / mono-pitch: 1 section
  • Hip roof: 4 sections — ONLY when 4 hip ridges are individually visible
  • L-shaped hip: 6–8 sections
  • Complex multi-wing: 6–12 sections

Do NOT create extra sections from:
  • Colour variation or shadow within one slope
  • Solar panels sitting flat on a slope
  • Fascia boards, gutters, or roof vents

Rules:
- North is UP in the image
- Return polygon vertices as PERCENTAGE coordinates: x% of width, y% of height (top-left origin)
- Do not include adjacent roofs, neighbouring dwellings, carports, sheds, trees, pools, or roads
- facing: the compass direction the slope DRAINS toward (N/NE/E/SE/S/SW/W/NW)
- pitch_est: estimated pitch in degrees (typical QLD: 15-30°; flat metal: <5°)
- roof_lines: visible classified line features. Only include a line when you can trace it.
  Do NOT return a line with length zero. If a feature is not visible, omit it.
  Line types:
    ridge = high horizontal/apex line where opposite roof planes meet
    hip = outward diagonal line from ridge/apex down to roof corner
    valley = inward drainage line where roof wings meet
    rake = exposed sloping gable edge
- If you cannot clearly see the roof sections, still return your best estimate

Respond with ONLY valid JSON, no explanation, no markdown fences. Format:
{
  "roof_outline": [[x1,y1],[x2,y2],[x3,y3],...],
  "roof_lines": [
    { "type": "ridge|hip|valley|rake", "points": [[x1,y1],[x2,y2]], "confidence": "high|medium|low", "notes": "" }
  ],
  "sections": [
    { "id": 1, "label": "North slope", "facing": "N", "pitch_est": 22, "polygon": [[x1,y1],[x2,y2],[x3,y3],...], "notes": "" }
  ],
  "roof_type": "hip|gable|flat|complex",
  "confidence": "high|medium|low",
  "notes": "overall observation"
}`;

export const FACING_COLORS: Record<string, string> = {
  N: "#3B82F6", NE: "#06B6D4", E: "#F59E0B", SE: "#EF4444",
  S: "#F97316", SW: "#EC4899", W: "#8B5CF6", NW: "#10B981",
};

export const ROOF_LINE_TYPES = ["ridge", "valley", "hip", "rake"] as const;
const FACING_AZIMUTH_DEG: Record<string, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
};

type Json = Record<string, unknown>;
type Pt = [number, number];

const r2 = (v: number) => Math.round(v * 100) / 100;

export function cleanPctPolygon(poly: unknown): Pt[] {
  const out: Pt[] = [];
  if (!Array.isArray(poly)) return out;
  for (const p of poly) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([r2(Math.max(0, Math.min(100, x))), r2(Math.max(0, Math.min(100, y)))]);
  }
  return out.length >= 3 ? out : [];
}

export function cleanGeoPolygonLatLng(poly: unknown): Pt[] {
  const out: Pt[] = [];
  if (!Array.isArray(poly)) return out;
  for (const p of poly) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const lat = Number(p[0]);
    const lng = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) out.push([lat, lng]);
  }
  return out.length >= 3 ? out : [];
}

export function pointInPolyXy(x: number, y: number, poly: Pt[]): boolean {
  const n = poly.length;
  if (n < 3) return true;
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
    j = i;
  }
  return inside;
}

/** Drop sections whose centroid is outside the footprint; keep all if that empties it. */
export function filterSectionsToFootprint(parsed: Json, footprintPct: Pt[]): number {
  if (footprintPct.length < 3) return 0;
  const sections = (parsed.sections as Json[]) ?? [];
  const kept: Json[] = [];
  const dropped: Json[] = [];
  for (const sec of sections) {
    const poly = (sec.polygon as number[][]) ?? [];
    if (poly.length < 3) {
      dropped.push(sec);
      continue;
    }
    const cx = poly.reduce((s, p) => s + Number(p[0]), 0) / poly.length;
    const cy = poly.reduce((s, p) => s + Number(p[1]), 0) / poly.length;
    if (pointInPolyXy(cx, cy, footprintPct)) kept.push(sec);
    else dropped.push(sec);
  }
  const note = String(parsed.notes ?? "");
  if (!kept.length) {
    parsed.notes = (note + " Footprint boundary could not be used for section filtering — showing all detected sections.").trim();
    return 0;
  }
  parsed.sections = kept;
  if (dropped.length) {
    parsed.notes = `${note} ${dropped.length} section(s) outside the selected footprint were discarded.`.trim();
  }
  return dropped.length;
}

function centroidPct(sec: Json): Pt {
  const poly = (sec.polygon as number[][]) ?? [];
  if (!poly.length) return [50, 50];
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
}

/** Merge smallest sections into nearest neighbour when low-confidence & too many. */
export function mergeWeakSections(parsed: Json, maxSections = 8): void {
  const sections = (parsed.sections as Json[]) ?? [];
  if (parsed.confidence !== "low" || sections.length <= maxSections) return;
  let merged = 0;
  while (sections.length > maxSections) {
    let smallestI = 0;
    for (let i = 1; i < sections.length; i++) {
      if (Number(sections[i].area_m2 ?? 0) < Number(sections[smallestI].area_m2 ?? 0)) smallestI = i;
    }
    const [cx, cy] = centroidPct(sections[smallestI]);
    let bestJ = -1;
    let bestDist = Infinity;
    for (let j = 0; j < sections.length; j++) {
      if (j === smallestI) continue;
      const [sx, sy] = centroidPct(sections[j]);
      const d = Math.hypot(cx - sx, cy - sy);
      if (d < bestDist) {
        bestDist = d;
        bestJ = j;
      }
    }
    if (bestJ < 0) break;
    const absorbed = sections.splice(smallestI, 1)[0];
    const targetJ = bestJ < smallestI ? bestJ : bestJ - 1;
    if (targetJ >= 0 && targetJ < sections.length) {
      const nb = sections[targetJ];
      nb.area_m2 = r2(Number(nb.area_m2 ?? 0) + Number(absorbed.area_m2 ?? 0));
      const lbl = (absorbed.label as string) || `S${absorbed.id ?? ""}`;
      nb.notes = `${(nb.notes as string) ?? ""} +${lbl}`.trim();
    }
    merged += 1;
  }
  if (merged) {
    parsed.notes = `${String(parsed.notes ?? "")} [${merged} section(s) auto-merged — low confidence]`.trim();
  }
}

// ── Roof-line feature derivation ──────────────────────────────────────────────
function pctToPx(point: unknown, width: number, height: number): Pt | null {
  if (!Array.isArray(point) || point.length < 2) return null;
  const x = (Number(point[0]) / 100) * width;
  const y = (Number(point[1]) / 100) * height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}
const segLen = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const segAngle = (a: Pt, b: Pt) => ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 180) % 180;
function angleDelta180(a: number, b: number): number {
  const diff = Math.abs((a - b) % 180);
  return Math.min(diff, 180 - diff);
}
function facingDelta(a: unknown, b: unknown): number | null {
  if (!a || !b) return null;
  const av = FACING_AZIMUTH_DEG[String(a).toUpperCase()];
  const bv = FACING_AZIMUTH_DEG[String(b).toUpperCase()];
  if (av === undefined || bv === undefined) return null;
  const diff = Math.abs(av - bv) % 360;
  return Math.min(diff, 360 - diff);
}

function minRectDimensions(points: Pt[]): [number, number] {
  const pts = points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 2) return [0, 0];
  const angles = new Set<number>();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (segLen(a, b) > 0.01) angles.add(Math.round(((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI % 180) * 10) / 10);
  }
  if (!angles.size) angles.add(0);
  let best: [number, number, number] | null = null;
  for (const deg of angles) {
    const rad = (deg * Math.PI) / 180;
    const ux: Pt = [Math.cos(rad), Math.sin(rad)];
    const uy: Pt = [-Math.sin(rad), Math.cos(rad)];
    const px = pts.map((p) => p[0] * ux[0] + p[1] * ux[1]);
    const py = pts.map((p) => p[0] * uy[0] + p[1] * uy[1]);
    const w = Math.max(...px) - Math.min(...px);
    const h = Math.max(...py) - Math.min(...py);
    const area = w * h;
    if (best === null || area < best[0]) best = [area, Math.max(w, h), Math.min(w, h)];
  }
  return best ? [best[1], best[2]] : [0, 0];
}

function roofFamily(value = "", sectionCount = 0): string {
  const t = String(value ?? "").toLowerCase();
  if (t.includes("gable")) return "gable";
  if (t.includes("hip")) return "hip";
  if (t.includes("flat") || t.includes("skillion") || t.includes("mono")) return "flat";
  if (t.includes("complex") || t.includes("ultra") || t.includes("multi")) return "complex";
  if (sectionCount >= 6) return "complex";
  if (sectionCount >= 3) return "hip";
  if (sectionCount === 2) return "gable";
  return "gable";
}

function estimateLineValuesFromDims(longM: number, shortM: number, pitchDeg = 20, family = "gable"): Json {
  longM = Math.max(0, longM || 0);
  shortM = Math.max(0, shortM || 0);
  const pitch = Math.max(0, Math.min(pitchDeg || 20, 60));
  const slope = 1 / Math.max(Math.cos((pitch * Math.PI) / 180), 0.2);
  const fam = roofFamily(family);
  const values: Record<string, number> = { ridge: 0, valley: 0, hip: 0, rake: 0 };
  if (longM <= 0 || shortM <= 0) return values;
  if (fam === "flat") {
    /* none */
  } else if (fam === "gable") {
    values.ridge = longM;
    values.rake = 2 * shortM * slope;
  } else if (fam === "hip") {
    values.ridge = Math.max(0, longM - shortM);
    values.hip = 4 * (shortM / Math.SQRT2) * slope;
  } else {
    values.ridge = longM * 0.45;
    values.valley = shortM * 0.6;
    values.hip = shortM * 1.2 * slope;
    values.rake = shortM * 0.5 * slope;
  }
  for (const k of Object.keys(values)) values[k] = r2(values[k]);
  return values;
}

function estimateFromPctOutline(parsed: Json, width: number, height: number, mpp: number): Json {
  const outline = cleanPctPolygon(parsed.roof_outline);
  const ptsM: Pt[] = [];
  for (const p of outline) {
    const px = pctToPx(p, width, height);
    if (px) ptsM.push([px[0] * mpp, px[1] * mpp]);
  }
  const [longM, shortM] = minRectDimensions(ptsM);
  const sections = (parsed.sections as Json[]) ?? [];
  const pitches: number[] = [];
  for (const sec of sections) {
    const p = Number(sec.pitch_est ?? sec.pitch_deg ?? 0);
    if (p > 1) pitches.push(p);
  }
  const pitch = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 20;
  const family = roofFamily(String(parsed.roof_type ?? ""), sections.length);
  return {
    source: "footprint_geometry_estimate",
    confidence: longM > 0 && shortM > 0 ? "MEDIUM" : "LOW",
    roof_family: family,
    pitch_deg: r2(pitch),
    long_m: r2(longM),
    short_m: r2(shortM),
    values: estimateLineValuesFromDims(longM, shortM, pitch, family),
    notes: [`Estimated from ${family} roof model using footprint dimensions ${longM.toFixed(1)} m x ${shortM.toFixed(1)} m and pitch ${pitch.toFixed(1)}°.`],
  };
}

function lineOverlapPx(a1: Pt, a2: Pt, b1: Pt, b2: Pt, tolPx = 8): number {
  const la = segLen(a1, a2);
  const lb = segLen(b1, b2);
  if (la < 3 || lb < 3) return 0;
  if (angleDelta180(segAngle(a1, a2), segAngle(b1, b2)) > 12) return 0;
  const ux = (a2[0] - a1[0]) / la;
  const uy = (a2[1] - a1[1]) / la;
  const nx = -uy;
  const ny = ux;
  const d1 = Math.abs((b1[0] - a1[0]) * nx + (b1[1] - a1[1]) * ny);
  const d2 = Math.abs((b2[0] - a1[0]) * nx + (b2[1] - a1[1]) * ny);
  if (Math.max(d1, d2) > tolPx) return 0;
  const aProj = [0, la].sort((x, y) => x - y);
  const bProj = [
    (b1[0] - a1[0]) * ux + (b1[1] - a1[1]) * uy,
    (b2[0] - a1[0]) * ux + (b2[1] - a1[1]) * uy,
  ].sort((x, y) => x - y);
  return Math.max(0, Math.min(aProj[1], bProj[1]) - Math.max(aProj[0], bProj[0]));
}

function classifySharedEdge(a: Json, b: Json): string | null {
  const diff = facingDelta(a.facing, b.facing);
  if (diff === null) return null;
  if (diff >= 135) return "ridge";
  if (diff < 45) return "valley";
  return "hip";
}

function visibleRoofLinesFromModel(parsed: Json, width: number, height: number, mpp: number): [Record<string, number>, Json[]] {
  const totals: Record<string, number> = { ridge: 0, valley: 0, hip: 0, rake: 0 };
  const details: Json[] = [];
  for (const raw of (parsed.roof_lines as Json[]) ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const lineType = String(raw.type ?? "").trim().toLowerCase();
    if (!(lineType in totals)) continue;
    const points = (raw.points as number[][]) ?? (raw.line as number[][]) ?? [];
    if (points.length < 2) continue;
    const p1 = pctToPx(points[0], width, height);
    const p2 = pctToPx(points[1], width, height);
    if (!p1 || !p2) continue;
    const lengthM = segLen(p1, p2) * mpp;
    if (lengthM <= 0.3) continue;
    let conf = String(raw.confidence ?? parsed.confidence ?? "low").toLowerCase();
    if (!["high", "medium", "low"].includes(conf)) conf = "low";
    totals[lineType] += lengthM;
    details.push({ type: lineType, points: points.slice(0, 2), length_m: r2(lengthM), confidence: conf, source: "ai_visible_line", notes: String(raw.notes ?? "").slice(0, 160) });
  }
  return [totals, details];
}

function heuristicRoofLinesFromSections(parsed: Json, width: number, height: number, mpp: number): [Record<string, number>, Json[], string[]] {
  const totals: Record<string, number> = { ridge: 0, valley: 0, hip: 0, rake: 0 };
  const details: Json[] = [];
  const notes: string[] = [];
  const sections = ((parsed.sections as Json[]) ?? []).filter((s) => ((s.polygon as number[][]) ?? []).length >= 3);
  if (sections.length < 2) {
    notes.push("Using footprint geometry estimate because separate section boundaries were not supplied.");
    return [totals, details, notes];
  }
  const edges: { idx: number; sec: Json; a: Pt; b: Pt }[] = [];
  sections.forEach((sec, idx) => {
    const pts: Pt[] = [];
    for (const p of (sec.polygon as number[][]) ?? []) {
      const px = pctToPx(p, width, height);
      if (px) pts.push(px);
    }
    if (pts.length < 3) return;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (segLen(a, b) >= 4) edges.push({ idx, sec, a, b });
    }
  });
  const seen = new Set<string>();
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const ea = edges[i];
      const eb = edges[j];
      if (ea.idx === eb.idx) continue;
      const overlap = lineOverlapPx(ea.a, ea.b, eb.a, eb.b);
      if (overlap <= 4) continue;
      const lineType = classifySharedEdge(ea.sec, eb.sec);
      if (!lineType) continue;
      const lengthM = overlap * mpp;
      const key = `${lineType}:${Math.min(ea.idx, eb.idx)}:${Math.max(ea.idx, eb.idx)}:${Math.round(lengthM * 10) / 10}`;
      if (seen.has(key)) continue;
      seen.add(key);
      totals[lineType] += lengthM;
      details.push({ type: lineType, length_m: r2(lengthM), confidence: "low", source: "section_boundary_heuristic", notes: `Derived from adjacent section polygons ${ea.sec.id ?? ea.idx + 1} and ${eb.sec.id ?? eb.idx + 1}.` });
    }
  }
  notes.push(
    details.length
      ? "Ridge/valley/hip lengths were derived from adjacent section polygons; the derivation source is retained with each numeric value."
      : "Using footprint geometry estimate because shared section boundaries were not separately classified.",
  );
  return [totals, details, notes];
}

export function deriveRoofLineFeatures(parsed: Json, width: number, height: number, mpp: number): Json {
  let [totals, details] = visibleRoofLinesFromModel(parsed, width, height, mpp);
  const estimate = estimateFromPctOutline(parsed, width, height, mpp);
  let notes = [...((estimate.notes as string[]) ?? [])];
  let source = "ai_visible_line";
  if (!Object.values(totals).some((v) => v > 0)) {
    const [t, d, n] = heuristicRoofLinesFromSections(parsed, width, height, mpp);
    totals = t;
    details = d;
    source = d.length ? "section_boundary_heuristic" : "not_available";
    notes = [...n, ...((estimate.notes as string[]) ?? [])];
  }
  const estValues = (estimate.values as Record<string, number>) ?? {};
  if (ROOF_LINE_TYPES.some((k) => (totals[k] ?? 0) > 0) && ROOF_LINE_TYPES.some((k) => (totals[k] ?? 0) <= 0 && Number(estValues[k] ?? 0) > 0)) {
    source = `${source}+footprint_geometry_estimate`;
  }

  const output: Json = { source, details, notes, estimate_basis: estimate };
  const confValues = details.map((d) => (d.confidence as string) ?? "low");
  let overall: string;
  if (details.length && confValues.every((v) => v === "high")) overall = "HIGH";
  else if (details.length && confValues.some((v) => v === "medium")) overall = "MEDIUM";
  else if (details.length) overall = "LOW";
  else if (estimate.confidence === "MEDIUM") {
    overall = "MEDIUM";
    output.source = source = "footprint_geometry_estimate";
  } else overall = "LOW";
  output.confidence = overall;

  const status: Record<string, string> = {};
  for (const kind of ROOF_LINE_TYPES) {
    const value = r2(totals[kind] ?? 0);
    if (value > 0) {
      output[`${kind}_lm`] = value;
      status[kind] = source.startsWith("ai_visible_line") ? "detected" : "estimated_from_sections";
    } else {
      const fallback = r2(Number(estValues[kind] ?? 0));
      output[`${kind}_lm`] = fallback;
      status[kind] = fallback > 0 ? "estimated_from_footprint" : "not_applicable";
    }
  }
  output.status = status;
  return output;
}

/** Attach facing colour + shoelace m² (with pitch slope factor) to each section. */
export function attachSectionGeometry(parsed: Json, width: number, height: number, mpp: number): void {
  for (const sec of (parsed.sections as Json[]) ?? []) {
    sec.color = FACING_COLORS[String(sec.facing ?? "")] ?? "#607D8B";
    const poly = (sec.polygon as number[][]) ?? [];
    if (poly.length >= 3) {
      const pxPoly = poly.map((p) => [(p[0] / 100) * width, (p[1] / 100) * height] as Pt);
      const n = pxPoly.length;
      let areaPx2 = 0;
      for (let i = 0; i < n; i++) {
        areaPx2 += pxPoly[i][0] * pxPoly[(i + 1) % n][1] - pxPoly[(i + 1) % n][0] * pxPoly[i][1];
      }
      areaPx2 = Math.abs(areaPx2) / 2;
      const pitchRad = (Number(sec.pitch_est ?? 20) * Math.PI) / 180;
      const slope = pitchRad < Math.PI / 2 ? 1 / Math.cos(pitchRad) : 1;
      sec.area_m2 = Math.round(areaPx2 * mpp ** 2 * slope * 10) / 10;
    } else {
      sec.area_m2 = 0;
    }
  }
}
