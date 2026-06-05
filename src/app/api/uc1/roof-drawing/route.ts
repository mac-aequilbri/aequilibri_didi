import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { callClaudeVision } from "@/lib/claude";
import { metersPerPixel } from "@/lib/geometry";
import { getCached, setCached, SHORT_TTL_SECONDS } from "@/lib/cache";
import { computeQualityScore } from "@/services/uc1/roofQuality";
import { lookupGeoscapeBuilding } from "@/services/uc1/geoscape";
import { fullSolarAnalysis } from "@/services/uc1/solar";
import {
  ROOF_VISION_SYSTEM,
  cleanPctPolygon,
  pointInPolyXy,
  filterSectionsToFootprint,
  attachSectionGeometry,
  mergeWeakSections,
  deriveRoofLineFeatures,
  ROOF_LINE_TYPES,
} from "@/services/uc1/roofVision";
import {
  roofStaticMapView,
  cropStaticMapToSelectedRoof,
  imageHasBlackTileRegion,
  footprintImagePolygons,
  pctPolygonToGeo,
  annotateImageForRoofVision,
  staticMapPixel,
  type MapView,
} from "@/services/uc1/staticMap";

export const dynamic = "force-dynamic";

const MODEL_VERSION = "claude-opus-4-7";
const PROMPT_VERSION = "v4-roof-lines";
type Json = Record<string, unknown>;

function googleKey(): string {
  return process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_SOLAR_API_KEY || "";
}

async function fetchStaticMap(centerLat: number, centerLng: number, zoom: number, width: number, height: number, key: string): Promise<Buffer | null> {
  const params = new URLSearchParams({ center: `${centerLat},${centerLng}`, zoom: String(zoom), size: `${width}x${height}`, maptype: "satellite", key });
  try {
    const resp = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params}`, { headers: { "User-Agent": "aequilibri-poc/1.0" }, signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = ["1", "true", "yes"].includes((searchParams.get("force_refresh") ?? "").trim());

  let body: Json;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: "lat/lng required" }, { status: 400 });
  }
  const key = googleKey();
  if (!key) return NextResponse.json({ ok: false, error: "No Google API key configured" }, { status: 500 });

  let width = 640;
  let height = 640;

  let mapView: MapView = await roofStaticMapView(lat, lng, width, height, {
    fallbackZoom: Number(body.zoom ?? 20),
    maxZoom: Number(body.max_zoom ?? 21),
    knownRoofAreaM2: Number(body.known_roof_area_m2 ?? 0),
    knownGroundAreaM2: Number(body.known_ground_area_m2 ?? 0),
    useMsGuide: Boolean(body.use_ms_guide),
    focusPolygon: body.focus_polygon,
  });
  let zoom = mapView.zoom;
  let mapCenterLat = mapView.center_lat;
  let mapCenterLng = mapView.center_lng;

  // ── Fetch satellite image (cached) with black-tile retry ──
  let imgBytes: Buffer | null;
  const staticCachePayload = { center_lat: Math.round(mapCenterLat * 1e7) / 1e7, center_lng: Math.round(mapCenterLng * 1e7) / 1e7, zoom, size: `${width}x${height}`, maptype: "satellite", version: "black-tile-retry-v1" };
  const cachedStatic = getCached<{ img_b64: string; zoom: number }>("google_static_maps_satellite", staticCachePayload);
  if (cachedStatic) {
    imgBytes = Buffer.from(cachedStatic.img_b64, "base64");
    zoom = cachedStatic.zoom;
    mapView = { ...mapView, zoom, meters_per_px: (156543.03392 * Math.cos((mapCenterLat * Math.PI) / 180)) / 2 ** zoom };
  } else {
    imgBytes = await fetchStaticMap(mapCenterLat, mapCenterLng, zoom, width, height, key);
    if (imgBytes && (await imageHasBlackTileRegion(imgBytes)) && zoom > 17) {
      const retry = await fetchStaticMap(mapCenterLat, mapCenterLng, zoom - 1, width, height, key);
      if (retry && !(await imageHasBlackTileRegion(retry))) {
        imgBytes = retry;
        zoom -= 1;
        mapView = { ...mapView, zoom, meters_per_px: (156543.03392 * Math.cos((mapCenterLat * Math.PI) / 180)) / 2 ** zoom };
      }
    }
    if (imgBytes) setCached("google_static_maps_satellite", staticCachePayload, { img_b64: imgBytes.toString("base64"), zoom }, SHORT_TTL_SECONDS);
  }
  if (!imgBytes) return NextResponse.json({ ok: false, error: "Static Maps returned no image" }, { status: 502 });

  // ── Crop to selected roof ──
  const cropped = await cropStaticMapToSelectedRoof(imgBytes, mapView, lat, lng, width, height);
  imgBytes = cropped.bytes;
  width = cropped.width;
  height = cropped.height;
  mapView = cropped.mapView;
  mapCenterLat = mapView.center_lat;
  mapCenterLng = mapView.center_lng;
  zoom = mapView.zoom;

  const imgB64 = imgBytes.toString("base64");
  const [footprintPx, footprintPct] = footprintImagePolygons(mapView, width, height);
  const clickPx = staticMapPixel(lat, lng, mapCenterLat, mapCenterLng, zoom, width, height);
  const { b64: visionB64, mediaType: visionMediaType } = await annotateImageForRoofVision(imgBytes, footprintPx, clickPx);

  // ── Outline lock + unlock sanity check ──
  let outlineLocked = footprintPct.length > 0;
  let outlineUnlockReason = "";
  if (outlineLocked && footprintPx.length >= 3) {
    const clickPctXy: [number, number] = [(clickPx[0] / width) * 100, (clickPx[1] / height) * 100];
    if (!pointInPolyXy(clickPctXy[0], clickPctXy[1], footprintPct)) {
      const cx = footprintPct.reduce((s, p) => s + p[0], 0) / footprintPct.length;
      const cy = footprintPct.reduce((s, p) => s + p[1], 0) / footprintPct.length;
      const dxPx = ((clickPctXy[0] - cx) / 100) * width;
      const dyPx = ((clickPctXy[1] - cy) / 100) * height;
      const distM = Math.hypot(dxPx, dyPx) * (mapView.meters_per_px || 0.1);
      if (distM > 6) {
        outlineLocked = false;
        outlineUnlockReason = `click point is ${distM.toFixed(0)} m outside the footprint — likely wrong building; letting AI trace the outline`;
      }
    }
  }
  const guideSource = mapView.footprint_source || "";
  const guidePrompt = outlineLocked
    ? `The roof_outline is ALREADY PROVIDED and LOCKED — it is the green polygon shown on the image with this percentage-coordinate footprint: ${JSON.stringify(footprintPct)}. This outline comes from an authoritative building-footprint dataset and is ~99% accurate. DO NOT redraw it. Your ONLY job is to identify roof sections that lie ENTIRELY INSIDE this green polygon. `
    : "No external footprint guide is provided. Trace a tight roof_outline using only the yellow clicked point and image evidence. ";

  // ── Solar calibration hint (dominant pitch + total area only) ──
  let solarData: Json = {};
  let solarContext = "";
  try {
    const s = await fullSolarAnalysis(lat, lng);
    if (s.ok && Array.isArray(s.sections) && s.sections.length) {
      solarData = s;
      solarContext = `\n\nCalibration reference (Google Solar API, imagery ${s.imagery_date ?? "?"}): the dominant roof pitch at this location is approximately ${s.dominant_pitch_deg}°` + (s.total_area_m2 ? ` and the clicked building's total roof area is approximately ${s.total_area_m2} m²` : "") + ". Use the pitch when assigning pitch_est values. Do NOT use this to decide how many sections to draw.";
    }
  } catch {
    /* ignore */
  }

  const userPrompt = outlineLocked
    ? `Analyse this satellite image of the selected roof. Clicked coordinates: (${lat.toFixed(5)}, ${lng.toFixed(5)}). Image: ${width}x${height} pixels. ${guidePrompt}The roof_outline IS the green polygon — detect every roof section inside it using the ridge-line method. Verify each section vertex is inside the green polygon, each boundary aligns with a visible ridge/hip/valley line, and no sections overlap.${solarContext} Return JSON as instructed.`
    : `Analyze this tightly cropped satellite image of the selected roof. Clicked coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}); image center (${mapCenterLat.toFixed(5)}, ${mapCenterLng.toFixed(5)}) at zoom ${zoom}. Image size: ${width}x${height} pixels. ${guidePrompt}The yellow dot marks the SINGLE roof to analyse. Draw ONLY that building. Verify the yellow dot is inside roof_outline, all sections sit inside it, and every section boundary aligns with a visible ridge/hip/valley line.${solarContext} Return the JSON as instructed.`;

  // ── Cache key (annotated-image hash) ──
  let hashBytes: Buffer;
  try {
    hashBytes = Buffer.from(visionB64, "base64");
  } catch {
    hashBytes = imgBytes;
  }
  const imageHash = createHash("sha256").update(hashBytes).digest("hex").slice(0, 32);
  const cacheKey = createHash("sha256").update(`${lat.toFixed(6)}|${lng.toFixed(6)}|${zoom}|${imageHash}|${MODEL_VERSION}|${PROMPT_VERSION}`).digest("hex");

  let parsed: Json = {};
  let haveParsed = false;
  let cacheHit = false;
  let demoMode = false;

  if (!forceRefresh) {
    try {
      const hit = await prisma.uc1RoofAnalysisCache.findUnique({ where: { cacheKey } });
      if (hit) {
        cacheHit = true;
        haveParsed = true;
        parsed = typeof hit.resultJson === "string" ? JSON.parse(hit.resultJson) : (hit.resultJson as Json);
        await prisma.uc1RoofAnalysisCache.update({ where: { cacheKey }, data: { hitCount: { increment: 1 } } }).catch(() => {});
      }
    } catch {
      haveParsed = false;
    }
  }

  if (!haveParsed) {
    // NB: claude-opus-4-7 rejects the `temperature` param (deprecated for this
    // model), unlike when the Django app was written — so we omit it.
    const result = await callClaudeVision(ROOF_VISION_SYSTEM, userPrompt, visionB64, { mediaType: visionMediaType });
    demoMode = result.demo_mode;
    const raw = result.content.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { sections: [], roof_type: "unknown", confidence: "low", notes: "Could not parse Claude response" };
    }
    try {
      await prisma.uc1RoofAnalysisCache.upsert({
        where: { cacheKey },
        update: { resultJson: JSON.stringify(parsed), lat, lng, zoom, imageHash, modelVersion: MODEL_VERSION, promptVersion: PROMPT_VERSION },
        create: { cacheKey, address: String(body.address ?? "").slice(0, 255), lat, lng, zoom, imageHash, resultJson: JSON.stringify(parsed), modelVersion: MODEL_VERSION, promptVersion: PROMPT_VERSION },
      });
    } catch {
      /* best-effort */
    }
  }

  // ── Lock outline / filter sections / geometry / merge / line features ──
  let aiOutlinePct: number[][];
  let outlineSource: string;
  if (outlineLocked) {
    parsed.roof_outline = footprintPct;
    aiOutlinePct = footprintPct;
    outlineSource = guideSource || "geoscape_footprint";
  } else {
    aiOutlinePct = cleanPctPolygon(parsed.roof_outline);
    outlineSource = "ai_claude";
  }
  const aiFootprint = pctPolygonToGeo(aiOutlinePct as [number, number][], mapView, width, height);
  const sectionBoundary = aiOutlinePct.length >= 3 ? aiOutlinePct : footprintPct;
  const droppedSections = filterSectionsToFootprint(parsed, sectionBoundary as [number, number][]);

  const mpp = mapView.meters_per_px;
  attachSectionGeometry(parsed, width, height, mpp);
  mergeWeakSections(parsed, 8);
  const lineFeatures = deriveRoofLineFeatures(parsed, width, height, mpp);
  parsed.line_features = lineFeatures;

  // ── Quality score ──
  let quality: Json;
  try {
    let geoscapeForScore: { buildingArea?: number } | null = null;
    try {
      const gs = await lookupGeoscapeBuilding(lat, lng, String(body.address ?? ""));
      if (gs) geoscapeForScore = { buildingArea: gs.area_sqm as number };
    } catch {
      geoscapeForScore = null;
    }
    quality = computeQualityScore(parsed as never, geoscapeForScore, [width, height], metersPerPixel(lat, zoom)) as unknown as Json;
  } catch (e) {
    quality = { signals: { scoring_error: String(e).slice(0, 200) }, quality_score: null, needs_review: false };
  }

  const lf = lineFeatures as Json;
  return NextResponse.json({
    ok: true,
    image_b64: imgB64,
    media_type: "image/png",
    width,
    height,
    center: { lat: Math.round(mapCenterLat * 1e7) / 1e7, lng: Math.round(mapCenterLng * 1e7) / 1e7 },
    requested_point: { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 },
    footprint: mapView.footprint,
    footprint_pct: footprintPct,
    ai_footprint: aiFootprint,
    ai_outline_pct: aiOutlinePct,
    outline_source: outlineSource,
    outline_locked: outlineLocked,
    outline_unlock_reason: outlineUnlockReason,
    footprint_source: mapView.footprint_source,
    crop_box_px: mapView.crop_box_px ?? [],
    cropped: Boolean(mapView.cropped),
    static_map_version: "roof-crop-v4",
    guide_area_sqm: Math.round((mapView.guide_area_sqm || 0) * 10) / 10,
    target_span_m: Math.round((mapView.target_span_m || 0) * 10) / 10,
    dropped_sections: droppedSections,
    scale: { meters_per_px: Math.round(mpp * 10000) / 10000, zoom },
    sections: parsed.sections ?? [],
    roof_lines: parsed.roof_lines ?? [],
    line_features: lineFeatures,
    ridge_lm: lf.ridge_lm,
    valley_lm: lf.valley_lm,
    hip_lm: lf.hip_lm,
    rake_lm: lf.rake_lm,
    boundary_confidence: lf.confidence,
    roof_type: parsed.roof_type ?? "unknown",
    confidence: parsed.confidence ?? "low",
    notes: parsed.notes ?? "",
    demo_mode: demoMode,
    cache_hit: cacheHit,
    cache_key: cacheKey,
    prompt_version: PROMPT_VERSION,
    model_version: MODEL_VERSION,
    quality,
    solar_used: Boolean(solarData.ok),
    solar_total_area_m2: solarData.total_area_m2 ?? null,
    solar_dominant_pitch_deg: solarData.dominant_pitch_deg ?? null,
    solar_imagery_date: solarData.imagery_date ?? null,
    solar_imagery_quality: solarData.imagery_quality ?? null,
  });
}
