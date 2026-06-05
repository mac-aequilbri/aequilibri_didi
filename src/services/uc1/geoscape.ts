// Geoscape Buildings/Addresses API — port of geoscape_service.py.
// Looks up a normalized building footprint by address (preferred) or point.

import {
  LONG_TTL_SECONDS,
  NEGATIVE_TTL_SECONDS,
  cloneJsonable,
  getCached,
  normalizedAddress,
  roundedPoint,
  setCached,
} from "@/lib/cache";
import { haversineM, polygonAreaSqmLatLng, pointInPolyLatLng, centroid } from "@/lib/geometry";

const GEOSCAPE_API_BASE = "https://api.psma.com.au/v2";
const GEOSCAPE_ADDRESSES_BASE = "https://api.psma.com.au/v2/addresses";
const ADDITIONAL_PROPERTIES = "height,roof,solar";

type Json = Record<string, unknown>;

function consumerKey(): string {
  return process.env.GEOSCAPE_CONSUMER_KEY ?? "";
}

export function geoscapeConfigured(): boolean {
  return Boolean(consumerKey());
}

const num = (v: unknown, d = 0): number => {
  if (v === null || v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function looksLikeAddress(value: string): boolean {
  return value.length >= 8 && /[a-z]/i.test(value);
}

class GeoscapeError extends Error {}

async function apiGet(url: string, params: Record<string, unknown>): Promise<Json> {
  const key = consumerKey();
  if (!key) throw new GeoscapeError("Geoscape consumer key is not configured");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));

  let resp: Response;
  try {
    resp = await fetch(`${url}?${qs}`, {
      headers: {
        Authorization: key,
        Accept: "application/geo+json, application/json",
        "User-Agent": "aequilibri-roofing/1.0",
      },
      signal: AbortSignal.timeout(9_000),
    });
  } catch (exc) {
    throw new GeoscapeError(`Geoscape request failed: ${exc}`);
  }
  const body = await resp.text();
  if (!resp.ok) {
    throw new GeoscapeError(`Geoscape request failed: ${extractErrorMessage(body) || `HTTP ${resp.status}`}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new GeoscapeError("Geoscape returned a non-JSON response");
  }
}

function extractErrorMessage(body: string): string {
  if (!body) return "";
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return body.slice(0, 180);
  }
  if (data && typeof data === "object") {
    const d = data as Json;
    const fault = d.fault as Json | undefined;
    if (fault?.faultstring) return String(fault.faultstring);
    for (const key of ["message", "error", "error_description"]) if (d[key]) return String(d[key]);
  }
  return body.slice(0, 180);
}

async function geocodeAddress(address: string): Promise<Json | null> {
  const data = await apiGet(`${GEOSCAPE_ADDRESSES_BASE}/geocoder`, {
    address,
    matchType: "address",
    maxResults: 3,
    additionalProperties: "buildings",
  });
  const features = data.features;
  if (!Array.isArray(features)) return null;
  const scored: [number, Json][] = [];
  for (const feat of features as Json[]) {
    const props = (feat.properties as Json) ?? {};
    if (!props.addressId) continue;
    const score = num(feat.matchScore, num(props.matchScore, 0));
    scored.push([score, feat]);
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b[0] - a[0]);
  return scored[0][1];
}

function outerRings(geometry: Json): number[][][] {
  const gtype = String(geometry.type ?? "").toLowerCase();
  const coords = (geometry.coordinates as unknown[]) ?? [];
  const rawRings: unknown[][] = [];
  if (gtype === "polygon") {
    if (coords.length) rawRings.push(coords[0] as unknown[]);
  } else if (gtype === "multipolygon") {
    for (const poly of coords as unknown[][]) if (poly?.length) rawRings.push(poly[0] as unknown[]);
  }

  const rings: number[][][] = [];
  for (const ring of rawRings) {
    const clean: number[][] = [];
    for (const pos of (ring as unknown[]) ?? []) {
      if (!Array.isArray(pos) || pos.length < 2) continue;
      const lon = Number(pos[0]);
      const lat = Number(pos[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        clean.push([Math.round(lat * 1e7) / 1e7, Math.round(lon * 1e7) / 1e7]);
      }
    }
    let c = clean;
    if (c.length > 3 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c = c.slice(0, -1);
    if (c.length >= 3) rings.push(c);
  }
  return rings;
}

function normalizeBuildingFeature(feature: Json, lat: number, lon: number, sourceDetail: string): Json | null {
  if (!feature || typeof feature !== "object") return null;
  const props = (feature.properties as Json) ?? {};
  const rings = outerRings((feature.geometry as Json) ?? {});
  if (!rings.length) return null;

  const ringChoices = rings
    .map((ring) => {
      const area = polygonAreaSqmLatLng(ring);
      if (area < 4) return null;
      const c = centroid(ring);
      return {
        geometry: ring,
        area,
        centroid: c,
        contains: pointInPolyLatLng(lat, lon, ring),
        distance: haversineM(lat, lon, c[0], c[1]),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (!ringChoices.length) return null;

  ringChoices.sort(
    (a, b) => (a.contains ? 0 : 1) - (b.contains ? 0 : 1) || a.distance - b.distance || b.area - a.area,
  );
  const chosen = ringChoices[0];
  const propArea = num(props.buildingArea, num(props.area, chosen.area));
  const area = ringChoices.length > 1 ? chosen.area : propArea;
  const centroidLat = num(props.centroidLatitude, chosen.centroid[0]);
  const centroidLon = num(props.centroidLongitude, chosen.centroid[1]);

  const roof = (props.roof as Json) ?? (props.heightsAndRoofs as Json) ?? {};
  const height = (props.height as Json) ?? {};
  const solar = (props.solar as Json) ?? (props.solarIndicator as Json) ?? {};

  return {
    found: true,
    source: "geoscape",
    source_label: "Geoscape",
    source_detail: sourceDetail,
    area_sqm: Math.round(area * 10) / 10,
    geometry: chosen.geometry,
    centroid: [Math.round(centroidLat * 1e7) / 1e7, Math.round(centroidLon * 1e7) / 1e7],
    distance_m: Math.round(haversineM(lat, lon, centroidLat, centroidLon) * 10) / 10,
    contains_query_point: Boolean(chosen.contains),
    building_pid: props.buildingPid ?? props.buildingId ?? "",
    primary_building: props.primaryBuildingFlag ?? "",
    building_use: props.buildingUse ?? "",
    capture_resolution: props.captureResolution ?? "",
    capture_method: props.captureMethod ?? "",
    roof_shape: roof.roofShape ?? roof.roofType ?? "",
    roof_slope: roof.roofSlope ?? null,
    roof_material: roof.primaryRoofMaterial ?? "",
    roof_colour: roof.roofColour ?? "",
    eave_height_m: height.eaveHeight ?? roof.eaveHeight ?? null,
    roof_height_m: height.roofHeight ?? roof.roofHeight ?? null,
    solar_panel: "solarPanel" in solar ? solar.solarPanel : solar.solarFlag ?? null,
    solar_flag: solar.solarFlag ?? "",
    solar_area_m2: solar.solarArea ?? null,
    solar_daily_estimated_power_kwh: solar.dailyEstimatedPower ?? null,
  };
}

function bestBuildingFeature(data: Json, lat: number, lon: number, sourceDetail: string): Json | null {
  const features = Array.isArray(data?.features) ? (data.features as Json[]) : null;
  if (!features) return null;
  const candidates = features
    .map((f) => normalizeBuildingFeature(f, lat, lon, sourceDetail))
    .filter((c): c is Json => c !== null);
  if (!candidates.length) return null;

  const sortKey = (c: Json) => {
    const containsPenalty = c.contains_query_point ? 0 : 1000;
    const primaryPenalty = String(c.primary_building ?? "").toLowerCase() === "yes" ? 0 : 20;
    return containsPenalty + primaryPenalty + num(c.distance_m, 9999);
  };
  candidates.sort((a, b) => sortKey(a) - sortKey(b));
  return candidates[0];
}

export async function lookupGeoscapeBuilding(lat: number, lon: number, address = ""): Promise<Json | null> {
  if (!geoscapeConfigured()) return null;
  address = (address || "").trim();
  const cachePayload = {
    ...roundedPoint(lat, lon),
    address: normalizedAddress(address),
    properties: ADDITIONAL_PROPERTIES,
  };
  const cached = getCached<Json>("geoscape_building_lookup", cachePayload);
  if (cached !== null) {
    if (cached.found) {
      const result = cloneJsonable(cached.result as Json);
      result.cache_hit = true;
      return result;
    }
    return null;
  }

  let result: Json | null = null;
  if (looksLikeAddress(address)) {
    const addressFeature = await geocodeAddress(address);
    const addressId = ((addressFeature?.properties as Json) ?? {}).addressId;
    if (addressId) {
      const data = await apiGet(`${GEOSCAPE_API_BASE}/buildings/findByIdentifier`, {
        addressId,
        additionalProperties: ADDITIONAL_PROPERTIES,
        limit: 12,
        offset: 0,
      });
      const best = bestBuildingFeature(data, lat, lon, "geoscape_address");
      if (best) {
        best.address_id = addressId;
        result = best;
      }
    }
  }

  if (result === null) {
    const data = await apiGet(`${GEOSCAPE_API_BASE}/buildings/findByPoint`, {
      latitude: lat.toFixed(6),
      longitude: lon.toFixed(6),
      radius: 60,
      additionalProperties: ADDITIONAL_PROPERTIES,
      limit: 12,
      offset: 0,
    });
    result = bestBuildingFeature(data, lat, lon, "geoscape_point");
  }

  if (result) {
    result.cache_hit = false;
    setCached("geoscape_building_lookup", cachePayload, { found: true, result: cloneJsonable(result) }, LONG_TTL_SECONDS);
    return result;
  }
  setCached("geoscape_building_lookup", cachePayload, { found: false }, NEGATIVE_TTL_SECONDS);
  return null;
}
