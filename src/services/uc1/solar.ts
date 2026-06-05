// UC1 Roofing — Google Solar API service. Port of solar_api_service.py.
// Wraps buildingInsights:findClosest and derives boundary lengths
// (ridge/valley/hip/eave/rake) from roof-section geometry.

import {
  MEDIUM_TTL_SECONDS,
  NEGATIVE_TTL_SECONDS,
  cloneJsonable,
  getCached,
  roundedPoint,
  setCached,
} from "@/lib/cache";

const SOLAR_INSIGHTS_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest";

function getApiKey(): string {
  for (const name of ["GOOGLE_API_KEY", "GOOGLE_SOLAR_API_KEY", "GOOGLE_MAPS_API_KEY"]) {
    const key = process.env[name];
    if (key) return key;
  }
  return "";
}

const AZIMUTH_LABELS: [number, string][] = [
  [22.5, "N"], [67.5, "NE"], [112.5, "E"], [157.5, "SE"],
  [202.5, "S"], [247.5, "SW"], [292.5, "W"], [337.5, "NW"],
];

function azimuthLabel(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  for (const [threshold, label] of AZIMUTH_LABELS) if (d < threshold) return label;
  return "N";
}

function slopeCategory(pitch: number): string {
  if (pitch < 5) return "flat";
  if (pitch < 15) return "low";
  if (pitch < 25) return "medium";
  if (pitch < 35) return "steep";
  return "very steep";
}

const r = (v: number, p = 0) => {
  const f = 10 ** p;
  return Math.round(v * f) / f;
};
const num = (v: unknown, d = 0) => (v == null ? d : Number(v));

interface BBox {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}
export interface SolarSection {
  pitch_deg: number;
  azimuth_deg: number;
  area_m2: number;
  ground_area_m2: number;
  center: { lat: number; lng: number };
  bbox: BBox;
  facing: string;
  slope_category: string;
}

type Json = Record<string, unknown>;

export async function callBuildingInsights(lat: number, lng: number, quality = "LOW"): Promise<Json> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "GOOGLE_API_KEY not configured on server" };

  const cachePayload = { ...roundedPoint(lat, lng), quality: String(quality || "LOW").toUpperCase() };
  const cached = getCached<Json>("google_solar_building_insights", cachePayload);
  if (cached !== null) return { ...cloneJsonable(cached), api_cache_hit: true };

  const params = new URLSearchParams({
    "location.latitude": String(lat),
    "location.longitude": String(lng),
    requiredQuality: quality,
    key: apiKey,
  });

  let raw: Json;
  try {
    const resp = await fetch(`${SOLAR_INSIGHTS_URL}?${params}`, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) {
      const body = await resp.text();
      let msg = body.slice(0, 200);
      try {
        msg = (JSON.parse(body)?.error?.message as string) ?? msg;
      } catch {}
      const result = { ok: false, error: `Solar API HTTP ${resp.status}: ${msg}`, api_cache_hit: false };
      setCached("google_solar_building_insights", cachePayload, result, NEGATIVE_TTL_SECONDS);
      return result;
    }
    raw = (await resp.json()) as Json;
  } catch (e) {
    const result = { ok: false, error: String(e), api_cache_hit: false };
    setCached("google_solar_building_insights", cachePayload, result, NEGATIVE_TTL_SECONDS);
    return result;
  }

  const result = parseResponse(raw);
  result.api_cache_hit = false;
  setCached("google_solar_building_insights", cachePayload, result, MEDIUM_TTL_SECONDS);
  return result;
}

function parseResponse(raw: Json): Json {
  const sp = (raw.solarPotential as Json) ?? null;
  if (!sp) return { ok: false, error: "No solarPotential in Solar API response" };

  const whole = (sp.wholeRoofStats as Json) ?? {};
  const segmentsRaw = (sp.roofSegmentStats as Json[]) ?? [];
  const imageryDate = (raw.imageryDate as Json) ?? {};
  const dateStr = `${imageryDate.year ?? "?"}-${String(imageryDate.month ?? "?").padStart(2, "0")}`;

  const sections: SolarSection[] = segmentsRaw.map((seg) => {
    const stats = (seg.stats as Json) ?? {};
    const center = (seg.center as Json) ?? {};
    const bbox = (seg.boundingBox as Json) ?? {};
    const sw = (bbox.sw as Json) ?? {};
    const ne = (bbox.ne as Json) ?? {};
    const pitch = num(seg.pitchDegrees);
    const az = num(seg.azimuthDegrees);
    return {
      pitch_deg: r(pitch, 1),
      azimuth_deg: r(az, 1),
      area_m2: r(num(stats.areaMeters2), 2),
      ground_area_m2: r(num(stats.groundAreaMeters2), 2),
      center: { lat: num(center.latitude), lng: num(center.longitude) },
      bbox: {
        sw: { lat: num(sw.latitude), lng: num(sw.longitude) },
        ne: { lat: num(ne.latitude), lng: num(ne.longitude) },
      },
      facing: azimuthLabel(az),
      slope_category: slopeCategory(pitch),
    };
  });
  sections.sort((a, b) => b.area_m2 - a.area_m2);

  const configsRaw = (sp.solarPanelConfigs as Json[]) ?? [];
  const panelH = num(sp.panelHeightMeters, 1.879);
  const panelW = num(sp.panelWidthMeters, 1.045);
  const panelCapW = num(sp.panelCapacityWatts, 400);
  const panelLifeYr = num(sp.panelLifetimeYears, 20);
  const maxPanels = num(sp.maxArrayPanelsCount);
  const maxShineHr = num(sp.maxSunshineHoursPerYear);
  const co2 = num(sp.carbonOffsetFactorKgPerMwh);

  const panelUnitM2 = r(panelH * panelW, 3);
  const maxCapKw = r((maxPanels * panelCapW) / 1000, 2);
  const maxArrayAreaM2 = r(maxPanels * panelUnitM2, 1);

  let typicalConfig: Json | null = null;
  if (configsRaw.length) {
    const target = maxPanels * 0.66;
    typicalConfig = configsRaw.reduce((best, c) =>
      Math.abs(num(c.panelsCount) - target) < Math.abs(num(best.panelsCount) - target) ? c : best,
    );
  }
  const typPanels = typicalConfig ? num(typicalConfig.panelsCount) : 0;
  const typKwhYr = typicalConfig ? num(typicalConfig.yearlyEnergyDcKwh) : 0;
  const typCapKw = r((typPanels * panelCapW) / 1000, 2);
  const typAreaM2 = r(typPanels * panelUnitM2, 1);
  const maxKwhYr = configsRaw.length ? num(configsRaw[configsRaw.length - 1].yearlyEnergyDcKwh) : 0;

  return {
    ok: true,
    error: null,
    imagery_date: dateStr,
    imagery_quality: raw.imageryQuality ?? "UNKNOWN",
    section_count: sections.length,
    total_area_m2: r(num(whole.areaMeters2), 2),
    ground_area_m2: r(num(whole.groundAreaMeters2), 2),
    sections,
    panel_unit_m2: panelUnitM2,
    panel_cap_w: panelCapW,
    panel_life_yr: panelLifeYr,
    max_shine_hr: maxShineHr,
    co2_kg_mwh: co2,
    max_panels: maxPanels,
    max_area_m2: maxArrayAreaM2,
    max_cap_kw: maxCapKw,
    max_kwh_yr: r(maxKwhYr),
    typ_panels: typPanels,
    typ_area_m2: typAreaM2,
    typ_cap_kw: typCapKw,
    typ_kwh_yr: r(typKwhYr),
  };
}

// ── Boundary length derivation ──────────────────────────────────────────────
function bboxDimsM(bbox: BBox): [number, number] {
  const cosLat = Math.cos(((bbox.sw.lat + bbox.ne.lat) / 2) * (Math.PI / 180));
  return [Math.abs(bbox.ne.lng - bbox.sw.lng) * cosLat * 111320, Math.abs(bbox.ne.lat - bbox.sw.lat) * 111320];
}

function sectionsAdjacent(a: SolarSection, b: SolarSection, tolM = 3): boolean {
  const cosLat = Math.cos(a.center.lat * (Math.PI / 180));
  const tolLat = tolM / 111320;
  const tolLng = tolM / (111320 * cosLat);
  // latitude axis
  if (a.bbox.ne.lat + tolLat < b.bbox.sw.lat || b.bbox.ne.lat + tolLat < a.bbox.sw.lat) return false;
  // longitude axis
  if (a.bbox.ne.lng + tolLng < b.bbox.sw.lng || b.bbox.ne.lng + tolLng < a.bbox.sw.lng) return false;
  return true;
}

function junctionType(a: SolarSection, b: SolarSection): string {
  let azDiff = Math.abs(a.azimuth_deg - b.azimuth_deg) % 360;
  if (azDiff > 180) azDiff = 360 - azDiff;
  if (azDiff >= 135) return a.pitch_deg > 5 && b.pitch_deg > 5 ? "ridge" : "eave";
  if (azDiff < 45) return "valley";
  return "hip";
}

export interface BoundaryLengths {
  eave_lm: number;
  ridge_lm: number;
  valley_lm: number;
  hip_lm: number;
  rake_lm: number;
  perimeter_lm: number;
  confidence: string;
  notes: string[];
}

export function deriveBoundaryLengths(sections: SolarSection[]): BoundaryLengths {
  if (!sections.length) {
    return { eave_lm: 0, ridge_lm: 0, valley_lm: 0, hip_lm: 0, rake_lm: 0, perimeter_lm: 0, confidence: "LOW", notes: ["No sections available"] };
  }
  const notes: string[] = [];
  const widths: number[] = [];
  for (const s of sections) {
    const [w, h] = bboxDimsM(s.bbox);
    widths.push(r(Math.max(w, h), 2));
  }
  const totalEave = widths.reduce((a, b) => a + b, 0);
  let ridgeLm = 0, valleyLm = 0, hipLm = 0, adjacency = 0;

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (!sectionsAdjacent(sections[i], sections[j])) continue;
      const jtype = junctionType(sections[i], sections[j]);
      const shared = Math.min(widths[i], widths[j]);
      adjacency += 1;
      if (jtype === "ridge") ridgeLm += shared;
      else if (jtype === "valley") valleyLm += shared;
      else if (jtype === "hip") hipLm += shared;
    }
  }

  let rakeLm = 0;
  if (adjacency > 0 && ridgeLm > 0 && sections.length >= 2) {
    const endSections = sections.filter((s) => s.pitch_deg > 5).slice(0, 2);
    for (const s of endSections) {
      const [w, h] = bboxDimsM(s.bbox);
      const run = Math.min(w, h);
      const pitchRad = s.pitch_deg * (Math.PI / 180);
      rakeLm += pitchRad < Math.PI / 2 ? run / Math.cos(pitchRad) : run;
    }
  }

  if (adjacency === 0 && sections.length > 1) {
    notes.push(
      "No adjacent section pairs detected — boundary lengths are estimates only. " +
        "Nearmap oblique imagery recommended for precise linear metre measurements.",
    );
  }

  const confidence = adjacency >= sections.length - 1 ? "HIGH" : adjacency > 0 ? "MEDIUM" : "LOW";
  return {
    eave_lm: r(totalEave, 2),
    ridge_lm: r(ridgeLm, 2),
    valley_lm: r(valleyLm, 2),
    hip_lm: r(hipLm, 2),
    rake_lm: r(rakeLm, 2),
    perimeter_lm: r(totalEave, 2),
    confidence,
    notes,
  };
}

export async function fullSolarAnalysis(
  lat: number,
  lng: number,
  storeys = 1,
  solarPanels = false,
  solarHw = false,
): Promise<Json> {
  const t0 = performance.now();
  let solar = await callBuildingInsights(lat, lng, "LOW");
  if (!solar.ok) solar = await callBuildingInsights(lat, lng, "HIGH");

  if (!solar.ok) {
    return {
      ok: false,
      error: solar.error,
      data_source: "solar_api_failed",
      lidar_coverage: "unavailable",
      elapsed_ms: Math.round(performance.now() - t0),
    };
  }

  const sections = (solar.sections as SolarSection[]) ?? [];
  const boundary = deriveBoundaryLengths(sections);

  const totalArea = (solar.total_area_m2 as number) || 1;
  let dominantPitch = 0;
  if (sections.length) {
    dominantPitch = sections.reduce((s, sec) => s + sec.pitch_deg * sec.area_m2, 0) / totalArea;
  }

  let eaveHeightM: number | null = null;
  let ridgeHeightM: number | null = null;
  if (sections.length && boundary.eave_lm > 0) {
    const dom = sections[0];
    const [w, h] = bboxDimsM(dom.bbox);
    const groundRun = Math.min(w, h) / 2;
    const pitchRad = dom.pitch_deg * (Math.PI / 180);
    if (pitchRad > 0) ridgeHeightM = r(groundRun * Math.tan(pitchRad), 2);
    eaveHeightM = ({ 1: 2.7, 2: 5.5, 3: 8.5 } as Record<number, number>)[storeys] ?? 2.7;
  }

  const scaffoldingRequired = (eaveHeightM ?? 0) > 3;
  const scaffolding = {
    required: scaffoldingRequired,
    estimated_linear_m: r(boundary.perimeter_lm, 2),
    risk_level: (eaveHeightM ?? 0) > 6 ? "high" : scaffoldingRequired ? "medium" : "low",
    reason: eaveHeightM ? `Eave height ~${eaveHeightM.toFixed(1)} m` : "Storey-based estimate",
  };

  const analysisNotes = [...boundary.notes];
  if (solar.imagery_quality !== "HIGH") {
    analysisNotes.push(
      `Solar API imagery quality: ${solar.imagery_quality} (captured ${solar.imagery_date}) — HIGH quality recommended for precise measurements`,
    );
  }

  return {
    ok: true,
    error: null,
    data_source: "google_solar_api",
    lidar_coverage: "solar_api",
    imagery_date: solar.imagery_date,
    imagery_quality: solar.imagery_quality,
    section_count: solar.section_count,
    total_area_m2: solar.total_area_m2,
    ground_area_m2: solar.ground_area_m2,
    dominant_pitch_deg: r(dominantPitch, 1),
    perimeter_m: boundary.perimeter_lm,
    guttering_linear_m: boundary.eave_lm,
    eave_lm: boundary.eave_lm,
    ridge_lm: boundary.ridge_lm,
    valley_lm: boundary.valley_lm,
    hip_lm: boundary.hip_lm,
    rake_lm: boundary.rake_lm,
    boundary_confidence: boundary.confidence,
    eave_height_m: eaveHeightM,
    ridge_height_m: ridgeHeightM,
    solar_panels: solarPanels,
    solar_hw: solarHw,
    scaffolding,
    solar_panel_unit_m2: solar.panel_unit_m2 ?? 0,
    solar_panel_cap_w: solar.panel_cap_w ?? 0,
    solar_panel_life_yr: solar.panel_life_yr ?? 20,
    solar_max_shine_hr: solar.max_shine_hr ?? 0,
    solar_co2_kg_mwh: solar.co2_kg_mwh ?? 0,
    solar_max_panels: solar.max_panels ?? 0,
    solar_max_area_m2: solar.max_area_m2 ?? 0,
    solar_max_cap_kw: solar.max_cap_kw ?? 0,
    solar_max_kwh_yr: solar.max_kwh_yr ?? 0,
    solar_typ_panels: solar.typ_panels ?? 0,
    solar_typ_area_m2: solar.typ_area_m2 ?? 0,
    solar_typ_cap_kw: solar.typ_cap_kw ?? 0,
    solar_typ_kwh_yr: solar.typ_kwh_yr ?? 0,
    solar_panels_detected: false,
    sections,
    analysis_notes: analysisNotes,
    elapsed_ms: Math.round(performance.now() - t0),
  };
}
