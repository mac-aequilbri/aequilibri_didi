// Building-footprint lookup — port of services/footprints.py.
// Preference: Geoscape (when it identifies the property) → locally cached
// Microsoft-ML footprints, lazily importing the matching tile when needed.

import zlib from "node:zlib";
import { prisma } from "@/lib/db";
import { polygonAreaSqmLonLat } from "@/lib/geometry";
import { lookupGeoscapeBuilding } from "@/services/uc1/geoscape";

const MS_DATASET_LINKS_URL =
  "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv";
const MS_DATASET_ZOOM = 9;

let msDatasetIndex: Map<string, string> | null = null;

type Json = Record<string, unknown>;

export function quadkeyForPoint(lat: number, lon: number, zoom = MS_DATASET_ZOOM): string {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const tileX = Math.floor(((lon + 180) / 360) * n);
  const tileY = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  let out = "";
  for (let i = zoom; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if (tileX & mask) digit += 1;
    if (tileY & mask) digit += 2;
    out += String(digit);
  }
  return out;
}

async function getMsDatasetIndex(): Promise<Map<string, string>> {
  if (msDatasetIndex !== null) return msDatasetIndex;
  const index = new Map<string, string>();
  const resp = await fetch(MS_DATASET_LINKS_URL, { signal: AbortSignal.timeout(30_000) });
  const text = await resp.text();
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  const li = header.indexOf("Location");
  const qi = header.indexOf("QuadKey");
  const ui = header.indexOf("Url");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // Url is the last column and may contain commas — split into header.length parts.
    const parts = line.split(",");
    const location = (parts[li] ?? "").trim();
    if (location.toLowerCase() !== "australia") continue;
    const quadkey = (parts[qi] ?? "").trim();
    const url = parts.slice(ui).join(",").trim();
    if (quadkey && url) index.set(quadkey, url);
  }
  msDatasetIndex = index;
  return index;
}

async function isMsTileCached(quadkey: string): Promise<boolean> {
  try {
    const row = await prisma.uc1FootprintTileCache.findUnique({ where: { quadkey } });
    return row !== null;
  } catch {
    return false;
  }
}

async function markMsTileCached(quadkey: string): Promise<void> {
  try {
    await prisma.uc1FootprintTileCache.upsert({ where: { quadkey }, update: {}, create: { quadkey } });
  } catch {
    /* ignore */
  }
}

export async function importMsTileForPoint(lat: number, lon: number): Promise<number> {
  const quadkey = quadkeyForPoint(lat, lon);
  const cacheKey = `${quadkey}:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  if (await isMsTileCached(cacheKey)) return 0;

  const tileUrl = (await getMsDatasetIndex()).get(quadkey);
  if (!tileUrl) {
    await markMsTileCached(cacheKey);
    return 0;
  }

  const nearbyLatDelta = 300 / 111_000;
  const nearbyLonDelta = 300 / (111_000 * Math.max(Math.abs(Math.cos((lat * Math.PI) / 180)), 0.001));

  const resp = await fetch(tileUrl, { signal: AbortSignal.timeout(45_000) });
  const gzBuf = Buffer.from(await resp.arrayBuffer());
  const ndjson = zlib.gunzipSync(gzBuf).toString("utf8");

  const rows: {
    minLat: number; maxLat: number; minLon: number; maxLon: number;
    centroidLat: number; centroidLon: number; areaSqm: number; geometry: string;
  }[] = [];

  for (const rawLine of ndjson.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let obj: Json;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    let geom = (obj.geometry as Json) ?? null;
    if (!geom && obj.type === "Polygon") geom = obj;
    if (!geom || geom.type !== "Polygon") continue;
    const outer = ((geom.coordinates as number[][][]) ?? [[]])[0];
    if (!outer || outer.length < 4) continue;

    const lons = outer.map((c) => c[0]);
    const lats = outer.map((c) => c[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    if (maxLat < lat - nearbyLatDelta || minLat > lat + nearbyLatDelta) continue;
    if (maxLon < lon - nearbyLonDelta || minLon > lon + nearbyLonDelta) continue;

    const area = polygonAreaSqmLonLat(outer);
    if (area < 10 || area > 10_000) continue;

    rows.push({
      minLat, maxLat, minLon, maxLon,
      centroidLat: (minLat + maxLat) / 2,
      centroidLon: (minLon + maxLon) / 2,
      areaSqm: Math.round(area * 100) / 100,
      geometry: JSON.stringify(outer),
    });
  }

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 2000) {
      await prisma.uc1BuildingFootprint.createMany({ data: rows.slice(i, i + 2000) });
    }
  }
  await markMsTileCached(cacheKey);
  return rows.length;
}

interface FootprintRow {
  areaSqm: number;
  centroidLat: number;
  centroidLon: number;
  geometry: string;
}

export async function findNearestBuildingFootprint(
  lat: number,
  lon: number,
): Promise<[FootprintRow | null, number]> {
  const latDelta = 50 / 111_000;
  const lonDelta = 50 / (111_000 * Math.max(Math.abs(Math.cos((lat * Math.PI) / 180)), 0.001));
  const candidates = await prisma.uc1BuildingFootprint.findMany({
    where: {
      minLat: { lte: lat + latDelta },
      maxLat: { gte: lat - latDelta },
      minLon: { lte: lon + lonDelta },
      maxLon: { gte: lon - lonDelta },
    },
  });

  let best: FootprintRow | null = null;
  let bestDist = Infinity;
  for (const fp of candidates) {
    const dlat = (fp.centroidLat - lat) * 111_000;
    const dlon = (fp.centroidLon - lon) * 111_000 * Math.abs(Math.cos((lat * Math.PI) / 180));
    const dist = Math.hypot(dlat, dlon);
    if (dist < bestDist) {
      bestDist = dist;
      best = fp;
    }
  }
  if (best === null || bestDist > 60) return [null, bestDist];
  return [best, bestDist];
}

async function safeFootprintCount(): Promise<number | null> {
  try {
    return await prisma.uc1BuildingFootprint.count();
  } catch {
    return null;
  }
}

export async function lookupBuildingFootprint(
  lat: number,
  lon: number,
  address = "",
  opts: { importTiles?: boolean } = {},
): Promise<{ payload: Json; status: number }> {
  const importTiles = opts.importTiles ?? true;
  let geoscapeMessage = "";
  let geoscape: Json | null = null;
  try {
    geoscape = await lookupGeoscapeBuilding(lat, lon, address);
  } catch (exc) {
    geoscapeMessage = `Geoscape lookup failed: ${exc}`;
  }

  if (geoscape) {
    geoscape.count = (await safeFootprintCount()) ?? 0;
    geoscape.imported = 0;
    return { payload: geoscape, status: 200 };
  }

  const totalBefore = await safeFootprintCount();
  if (totalBefore === null) {
    return {
      payload: { found: false, count: 0, message: geoscapeMessage || "Building footprint table not ready yet." },
      status: 200,
    };
  }

  let imported = 0;
  let [best, bestDist] = await findNearestBuildingFootprint(lat, lon);
  if (best === null && importTiles) {
    // On-demand Microsoft-ML tile import — slow (tens of MB). Only for the
    // non-interactive path; the wizard/inspector pass importTiles:false.
    try {
      imported = await importMsTileForPoint(lat, lon);
    } catch (exc) {
      return { payload: { found: false, count: totalBefore, error: `Footprint tile lookup failed: ${exc}` }, status: 502 };
    }
    [best, bestDist] = await findNearestBuildingFootprint(lat, lon);
  }

  const totalAfter = (await safeFootprintCount()) ?? 0;
  if (best === null) {
    return {
      payload: {
        found: false,
        count: totalAfter,
        imported,
        message: geoscapeMessage || "No building footprint found within 60 m of the selected point.",
      },
      status: 200,
    };
  }

  const rawCoords: number[][] = JSON.parse(best.geometry);
  const leafletCoords = rawCoords.map((c) => [c[1], c[0]]);
  return {
    payload: {
      found: true,
      area_sqm: Math.round(best.areaSqm),
      geometry: leafletCoords,
      centroid: [best.centroidLat, best.centroidLon],
      distance_m: Math.round(bestDist * 10) / 10,
      count: totalAfter,
      imported,
      source: "microsoft",
      source_label: "Microsoft",
      source_detail: "microsoft_ml",
      geoscape_message: geoscapeMessage,
    },
    status: 200,
  };
}
