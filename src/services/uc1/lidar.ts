// LiDAR / roof elevation analysis — port of lidar_service.py.
// GeoTIFF parsing uses the `geotiff` npm package instead of the Python NumPy
// byte parser. Always succeeds: LiDAR steps fall back to storey estimates.

import { fromArrayBuffer } from "geotiff";
import { prisma } from "@/lib/db";
import { haversineM, calculatePerimeter } from "@/lib/geometry";

const ELVIS_API = "https://elvis2.ga.gov.au/api/v1/datasets";
const GA_WCS_DSM = "https://services.ga.gov.au/gis/services/DEM_LiDAR_1m/MapServer/WCSServer";
const GA_WCS_DTM = "https://services.ga.gov.au/gis/services/DEM_SRTM_1Second_Hydro_Enforced/MapServer/WCSServer";
const SCAFFOLD_HEIGHT_THRESHOLD = 3.0;
const ELEV_BUFFER_DEG = 0.0002;

type Json = Record<string, unknown>;

interface Raster {
  data: Float64Array;
  width: number;
  height: number;
}

const round = (v: number, p = 0) => {
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

function polygonBbox(polygonCoords: number[][]): [number, number, number, number] {
  let pts = polygonCoords.map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
  if (Math.abs(pts[0][0]) > 90) pts = pts.map((p) => [p[1], p[0]]);
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  return [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)];
}

/** percentile of an array (linear interpolation), NaN-aware. */
function nanPercentile(values: number[], p: number): number {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return NaN;
  const idx = (p / 100) * (clean.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return clean[lo];
  return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
}

export async function detectAllStructures(lat: number, lng: number, radiusM = 30): Promise<Json[]> {
  try {
    const degOffset = radiusM / 111_000;
    const rows = await prisma.uc1BuildingFootprint.findMany({
      where: {
        minLat: { lte: lat + degOffset },
        maxLat: { gte: lat - degOffset },
        minLon: { lte: lng + degOffset },
        maxLon: { gte: lng - degOffset },
      },
    });
    const structures: Json[] = [];
    for (const fp of rows) {
      const dist = haversineM(lat, lng, fp.centroidLat, fp.centroidLon);
      if (dist <= radiusM) {
        let coords: number[][] = [];
        try {
          coords = JSON.parse(fp.geometry);
        } catch {
          coords = [];
        }
        structures.push({
          id: fp.id,
          area_sqm: round(fp.areaSqm, 1),
          centroid_lat: fp.centroidLat,
          centroid_lon: fp.centroidLon,
          distance_m: round(dist, 1),
          perimeter_m: calculatePerimeter(coords),
          geometry: coords,
        });
      }
    }
    structures.sort((a, b) => (a.distance_m as number) - (b.distance_m as number));
    return structures;
  } catch {
    return [];
  }
}

export async function checkLidarCoverage(lat: number, lng: number): Promise<Json> {
  const buf = 0.005;
  const bbox = `${lng - buf},${lat - buf},${lng + buf},${lat + buf}`;
  try {
    const resp = await fetch(`${ELVIS_API}?bbox=${bbox}&type=lidar&state=QLD`, {
      headers: { "User-Agent": "aequilibri-platform/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await resp.json();
    const datasets: unknown[] = Array.isArray(data) ? data : (data?.results ?? []);
    const lidarSets = datasets.filter((d) => JSON.stringify(d).toLowerCase().includes("lidar"));
    return { available: lidarSets.length > 0, datasets: lidarSets.slice(0, 3), resolution_m: lidarSets.length ? 1.0 : null };
  } catch {
    return { available: false, datasets: [], resolution_m: null };
  }
}

async function fetchWcsRaster(wcsUrl: string, bboxStr: string, width = 60, height = 60): Promise<Raster | null> {
  const params = new URLSearchParams({
    SERVICE: "WCS", VERSION: "1.0.0", REQUEST: "GetCoverage", COVERAGE: "1",
    CRS: "EPSG:4326", BBOX: bboxStr, WIDTH: String(width), HEIGHT: String(height), FORMAT: "GeoTIFF_Float",
  });
  try {
    const resp = await fetch(`${wcsUrl}?${params}`, {
      headers: { "User-Agent": "aequilibri-platform/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const tiff = await fromArrayBuffer(buf);
    const image = await tiff.getImage();
    const rasters = await image.readRasters({ interleave: true });
    const w = image.getWidth();
    const h = image.getHeight();
    const src = rasters as unknown as ArrayLike<number>;
    const data = new Float64Array(w * h);
    for (let i = 0; i < data.length; i++) {
      const v = src[i];
      data[i] = v < -1000 ? NaN : v; // nodata → NaN
    }
    return { data, width: w, height: h };
  } catch {
    return null;
  }
}

function analyzeElevationArrays(dsm: Raster, dtm: Raster): Json {
  const n = Math.min(dsm.data.length, dtm.data.length);
  const roofHeights: number[] = [];
  for (let i = 0; i < n; i++) {
    const ndsm = dsm.data[i] - dtm.data[i];
    if (ndsm > 1.0) roofHeights.push(ndsm); // >1m above ground = building
  }
  if (!roofHeights.length) {
    return { ridge_height_m: null, eave_height_m: null, height_range_m: null, data_source: "lidar_no_data" };
  }
  const ridge = nanPercentile(roofHeights, 95);
  const eave = nanPercentile(roofHeights, 10);
  return {
    ridge_height_m: round(ridge, 2),
    eave_height_m: round(eave, 2),
    height_range_m: round(ridge - eave, 2),
    data_source: "lidar_1m",
  };
}

function estimateHeightsFromStoreys(storeys = 1): Json {
  const eave = ({ 1: 2.7, 2: 5.5, 3: 8.5 } as Record<number, number>)[storeys] ?? 2.7;
  const ridge = eave + 2.0;
  return { ridge_height_m: ridge, eave_height_m: eave, height_range_m: round(ridge - eave, 2), data_source: "estimated_from_storeys" };
}

export function assessScaffolding(eaveHeightM: number, perimeterM: number): Json {
  const required = eaveHeightM > SCAFFOLD_HEIGHT_THRESHOLD;
  if (!required) {
    return { required: false, reason: `Eave height ${eaveHeightM.toFixed(1)} m — below 3 m threshold`, estimated_linear_m: 0, risk_level: "low" };
  }
  return {
    required: true,
    reason: `Eave height ${eaveHeightM.toFixed(1)} m — exceeds 3 m WHS threshold`,
    estimated_linear_m: round(perimeterM * 0.9, 1),
    risk_level: eaveHeightM > 6.0 ? "high" : "medium",
  };
}

export async function fullRoofAnalysis(
  lat: number,
  lng: number,
  polygonCoords: number[][],
  storeys = 1,
  solarPanels = false,
  solarHw = false,
): Promise<Json> {
  const t0 = performance.now();
  const notes: string[] = [];

  const perimeterM = calculatePerimeter(polygonCoords);
  const gutteringM = round(perimeterM * 0.85, 1);
  notes.push(`Perimeter calculated from ${polygonCoords.length}-point polygon: ${perimeterM.toFixed(1)} m`);

  const structures = await detectAllStructures(lat, lng, 40);
  const nStructures = structures.length;
  if (nStructures > 1) notes.push(`${nStructures} structures detected on lot — estimator shows closest only`);
  else if (nStructures === 1) notes.push("Single structure confirmed on lot");
  else notes.push("Structure count: using building footprint only");

  let heightData: Json | null = null;
  let lidarCoverage = "none";
  const [minLat, minLon, maxLat, maxLon] = polygonBbox(polygonCoords);
  const buf = ELEV_BUFFER_DEG;
  const bboxStr = `${minLon - buf},${minLat - buf},${maxLon + buf},${maxLat + buf}`;

  const dsm = await fetchWcsRaster(GA_WCS_DSM, bboxStr);
  if (dsm) {
    const dtm = await fetchWcsRaster(GA_WCS_DTM, bboxStr);
    if (dtm && dsm.width === dtm.width && dsm.height === dtm.height) {
      heightData = analyzeElevationArrays(dsm, dtm);
      lidarCoverage = "full";
      notes.push("Elevation data retrieved from GA 1m LiDAR WCS");
    } else {
      const positive = Array.from(dsm.data).filter((v) => v > 0);
      const roofH = nanPercentile(positive, 90);
      const groundH = nanPercentile(positive, 5);
      heightData = {
        ridge_height_m: round(roofH - groundH, 2),
        eave_height_m: round((roofH - groundH) * 0.6, 2),
        height_range_m: round((roofH - groundH) * 0.4, 2),
        data_source: "lidar_dsm_only",
      };
      lidarCoverage = "partial";
      notes.push("Elevation from DSM only (DTM unavailable) — reduced accuracy");
    }
  } else {
    notes.push("LiDAR WCS unavailable — falling back to storey-based estimates");
  }

  if (heightData === null) {
    heightData = estimateHeightsFromStoreys(storeys);
    lidarCoverage = "estimated";
  }

  const eaveH = (heightData.eave_height_m as number) ?? (estimateHeightsFromStoreys(storeys).eave_height_m as number);
  const scaffolding = assessScaffolding(eaveH, perimeterM);
  notes.push(`Scaffolding: ${(scaffolding.required as boolean) ? "REQUIRED" : "not required"} (eave ${eaveH.toFixed(1)} m)`);

  if (solarPanels) notes.push("Solar panels flagged — remove & reinstall line item will be added");
  if (solarHw) notes.push("Solar hot water flagged — disconnection & reconnection allowance will be added");

  return {
    perimeter_m: perimeterM,
    guttering_linear_m: gutteringM,
    ridge_height_m: heightData.ridge_height_m ?? null,
    eave_height_m: heightData.eave_height_m ?? null,
    height_range_m: heightData.height_range_m ?? null,
    scaffolding,
    structures,
    structure_count: Math.max(nStructures, 1),
    solar_panels: solarPanels,
    solar_hw: solarHw,
    lidar_coverage: lidarCoverage,
    data_source: heightData.data_source ?? "unknown",
    analysis_notes: notes,
    elapsed_ms: Math.round(performance.now() - t0),
  };
}
