// Shared geometry helpers — ported verbatim from the Django services
// (geoscape_service.py, lidar_service.py, footprints.py, roof_quality.py).
// Coordinate convention is documented per-function. Areas/distances in metres.

export type LatLng = [number, number]; // [lat, lng]
export type LonLat = [number, number]; // [lng, lat] (GeoJSON order)

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres between two [lat, lon] points. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Perimeter of a polygon in metres. Accepts [lat,lng] or [lng,lat] pairs and
 * auto-detects order (lat is -90..90). Mirrors lidar_service.calculate_perimeter.
 */
export function calculatePerimeter(polygonCoords: number[][]): number {
  if (polygonCoords.length < 3) return 0;
  let pts = polygonCoords.map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
  if (Math.abs(pts[0][0]) > 90) pts = pts.map((p) => [p[1], p[0]]);
  if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
    pts.push(pts[0]);
  }
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += haversineM(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Polygon area in m² for [lat, lng] coordinates, with latitude-cosine
 * correction. Mirrors geoscape_service._polygon_area_sqm_latlng.
 */
export function polygonAreaSqmLatLng(poly: number[][]): number {
  if (poly.length < 3) return 0;
  const meanLat = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cosLat = Math.max(Math.abs(Math.cos(toRad(meanLat))), 0.001);
  const pts = poly.map((p) => [p[1] * 111_320 * cosLat, p[0] * 111_320] as [number, number]);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length];
    area += pts[i][0] * q[1] - q[0] * pts[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Polygon area in m² for [lng, lat] (GeoJSON) coordinates.
 * Mirrors footprints.polygon_area_sqm_lonlat.
 */
export function polygonAreaSqmLonLat(coords: number[][]): number {
  if (coords.length < 3) return 0;
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const latM = (EARTH_RADIUS_M * Math.PI) / 180;
  const lonM = latM * Math.cos(toRad(avgLat));
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const x1 = coords[i][0] * lonM;
    const y1 = coords[i][1] * latM;
    const x2 = coords[j][0] * lonM;
    const y2 = coords[j][1] * latM;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/** Ray-casting point-in-polygon for [lat, lon] rings. Mirrors geoscape_service. */
export function pointInPolyLatLng(lat: number, lon: number, poly: number[][]): boolean {
  let inside = false;
  let j = poly.length - 1;
  for (let i = 0; i < poly.length; i++) {
    const yi = poly[i][0];
    const xi = poly[i][1];
    const yj = poly[j][0];
    const xj = poly[j][1];
    const intersects =
      xi > lon !== xj > lon && lat < ((yj - yi) * (lon - xi)) / ((xj - xi) || 1e-12) + yi;
    if (intersects) inside = !inside;
    j = i;
  }
  return inside;
}

/** Centroid [lat, lon] of a [lat, lon] ring. */
export function centroid(poly: number[][]): LatLng {
  const n = poly.length;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}

// ── Percent-coordinate helpers (roof drawing on a 0..100 image space) ──────────

/** Shoelace area for a polygon in % coordinates. Mirrors roof_quality.polygon_area_pct. */
export function polygonAreaPct(pts: number[][]): number {
  if (!pts || pts.length < 3) return 0;
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Andrew's monotone-chain convex hull → shoelace area. Mirrors roof_quality. */
export function convexHullAreaPct(pts: number[][]): number {
  if (!pts || pts.length < 3) return 0;
  const sorted = [...pts]
    .map((p) => [p[0], p[1]] as [number, number])
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: number[][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: number[][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return polygonAreaPct(hull);
}

/** Web Mercator ground resolution (m/px) at a latitude & zoom. Mirrors roof_quality. */
export function metersPerPixel(lat: number, zoom: number): number {
  try {
    const v = (156543.03392 * Math.cos(toRad(Number(lat)))) / 2 ** Math.trunc(zoom);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
