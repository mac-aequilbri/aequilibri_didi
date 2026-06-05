// Static-map projection + image processing for roof drawing — port of the
// image helpers in uc1_roofing/views. Uses @napi-rs/canvas (Canvas 2D) for
// crop / annotate / black-tile detection in place of Pillow.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { findNearestBuildingFootprint, importMsTileForPoint } from "@/services/uc1/footprints";
import { polygonAreaSqmLonLat } from "@/lib/geometry";
import { cleanGeoPolygonLatLng } from "@/services/uc1/roofVision";

type Pt = [number, number];

export interface MapView {
  center_lat: number;
  center_lng: number;
  zoom: number;
  meters_per_px: number;
  footprint: Pt[];
  footprint_source: string;
  guide_area_sqm: number;
  target_span_m: number;
  crop_box_px?: number[];
  cropped?: boolean;
}

const MERCATOR_K = 156543.03392;

export function staticMapPixel(lat: number, lng: number, centerLat: number, centerLng: number, zoom: number, width: number, height: number): Pt {
  const worldPoint = (aLat: number, aLng: number): Pt => {
    const siny = Math.max(-0.9999, Math.min(0.9999, Math.sin((aLat * Math.PI) / 180)));
    const scale = 256 * 2 ** zoom;
    return [((aLng + 180) / 360) * scale, (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale];
  };
  const [x, y] = worldPoint(lat, lng);
  const [cx, cy] = worldPoint(centerLat, centerLng);
  return [x - cx + width / 2, y - cy + height / 2];
}

export function staticMapLatLng(x: number, y: number, centerLat: number, centerLng: number, zoom: number, width: number, height: number): Pt {
  const siny = Math.max(-0.9999, Math.min(0.9999, Math.sin((centerLat * Math.PI) / 180)));
  const scale = 256 * 2 ** zoom;
  const centerX = ((centerLng + 180) / 360) * scale;
  const centerY = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale;
  const worldX = centerX + x - width / 2;
  const worldY = centerY + y - height / 2;
  const lng = (worldX / scale) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / scale))) * 180) / Math.PI;
  return [lat, lng];
}

function metersPerPx(centerLat: number, zoom: number): number {
  return (MERCATOR_K * Math.cos((centerLat * Math.PI) / 180)) / 2 ** zoom;
}

export async function roofStaticMapView(
  lat: number,
  lng: number,
  width: number,
  height: number,
  opts: { fallbackZoom?: number; maxZoom?: number; knownRoofAreaM2?: number; knownGroundAreaM2?: number; useMsGuide?: boolean; focusPolygon?: unknown } = {},
): Promise<MapView> {
  const focusPolygon = cleanGeoPolygonLatLng(opts.focusPolygon ?? []);
  let centerLat = lat;
  let centerLng = lng;
  const maxZoom = Math.min(opts.maxZoom ?? 20, 20);
  const fallbackZoom = Math.min(opts.fallbackZoom ?? 20, maxZoom);
  let footprint: Pt[] = [];
  let guideArea = 0;
  let footprintSource = "";

  if (focusPolygon.length) {
    footprint = focusPolygon;
    footprintSource = "selected_outline";
    const lats = footprint.map((p) => p[0]);
    const lngs = footprint.map((p) => p[1]);
    centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    guideArea = polygonAreaSqmLonLat(footprint.map((p) => [p[1], p[0]]));
  } else if (opts.useMsGuide) {
    let [best] = await findNearestBuildingFootprint(lat, lng);
    if (best === null) {
      try {
        await importMsTileForPoint(lat, lng);
        [best] = await findNearestBuildingFootprint(lat, lng);
      } catch {
        best = null;
      }
    }
    if (best) {
      const raw: number[][] = JSON.parse(best.geometry);
      footprint = raw.map((c) => [c[1], c[0]]);
      guideArea = best.areaSqm || 0;
      const lats = footprint.map((p) => p[0]);
      const lngs = footprint.map((p) => p[1]);
      centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      footprintSource = "microsoft";
    }
  }

  const roofHint = opts.knownRoofAreaM2 ?? 0;
  const groundHint = opts.knownGroundAreaM2 ?? 0;
  let areaHint: number;
  if (footprint.length) {
    areaHint = Math.max(guideArea, 90);
  } else {
    const saneGround = groundHint >= 20 && groundHint <= 1200 ? groundHint : 0;
    const saneRoof = roofHint >= 20 && roofHint <= 1500 ? roofHint * 0.82 : 0;
    areaHint = Math.max(saneGround, saneRoof, 160);
  }

  let guideSpanM = 0;
  if (footprint.length >= 3) {
    const lats = footprint.map((p) => p[0]);
    const lngs = footprint.map((p) => p[1]);
    const cosLat = Math.max(Math.abs(Math.cos((centerLat * Math.PI) / 180)), 0.001);
    guideSpanM = Math.max((Math.max(...lats) - Math.min(...lats)) * 111320, (Math.max(...lngs) - Math.min(...lngs)) * 111320 * cosLat);
  }

  if (footprintSource === "microsoft" && guideArea && areaHint > guideArea * 1.55) {
    centerLat = lat;
    centerLng = lng;
  }

  let targetSpanM: number;
  if (footprint.length) {
    targetSpanM = Math.min(Math.max(24, Math.sqrt(areaHint) * 1.9, guideSpanM * 1.45), 120);
  } else {
    targetSpanM = Math.min(Math.max(28, Math.sqrt(areaHint) * 2.2), 80);
  }

  let chosen = Math.max(17, Math.min(maxZoom, fallbackZoom));
  for (let z = maxZoom; z > 16; z--) {
    const mppZ = metersPerPx(centerLat, z);
    const visibleSpanM = Math.min(width, height) * mppZ;
    if (targetSpanM <= visibleSpanM * 0.9) {
      chosen = z;
      break;
    }
  }
  const zoom = chosen;
  return {
    center_lat: centerLat,
    center_lng: centerLng,
    zoom,
    meters_per_px: metersPerPx(centerLat, zoom),
    footprint,
    footprint_source: footprintSource,
    guide_area_sqm: guideArea,
    target_span_m: targetSpanM,
  };
}

function expandCropBox(left: number, top: number, right: number, bottom: number, imgW: number, imgH: number, minPx = 300): [number, number, number, number] {
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const cropW = Math.min(Math.max(right - left, minPx), imgW);
  const cropH = Math.min(Math.max(bottom - top, minPx), imgH);
  const l = Math.max(0, Math.min(imgW - cropW, cx - cropW / 2));
  const t = Math.max(0, Math.min(imgH - cropH, cy - cropH / 2));
  return [Math.floor(l), Math.floor(t), Math.ceil(l + cropW), Math.ceil(t + cropH)];
}

export async function cropStaticMapToSelectedRoof(
  imgBytes: Buffer,
  mapView: MapView,
  clickLat: number,
  clickLng: number,
  width: number,
  height: number,
): Promise<{ bytes: Buffer; width: number; height: number; mapView: MapView }> {
  try {
    const image = await loadImage(imgBytes);
    const imgW = image.width;
    const imgH = image.height;
    const mpp = mapView.meters_per_px || 0.1;
    const footprint = mapView.footprint ?? [];
    const points: Pt[] = [];

    if (footprint.length >= 3) {
      for (const p of footprint) {
        points.push(staticMapPixel(p[0], p[1], mapView.center_lat, mapView.center_lng, mapView.zoom, width, height));
      }
    }
    const clickPx = staticMapPixel(clickLat, clickLng, mapView.center_lat, mapView.center_lng, mapView.zoom, width, height);
    points.push(clickPx);

    let left: number, top: number, right: number, bottom: number;
    if (points.length >= 2) {
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const margin = Math.max(44, span * 0.32, 8 / mpp);
      left = Math.min(...xs) - margin;
      right = Math.max(...xs) + margin;
      top = Math.min(...ys) - margin;
      bottom = Math.max(...ys) + margin;
    } else {
      const [cx, cy] = clickPx;
      const cropSpan = Math.max(300, Math.min((mapView.target_span_m || 42) / mpp, Math.min(imgW, imgH)));
      left = cx - cropSpan / 2;
      right = cx + cropSpan / 2;
      top = cy - cropSpan / 2;
      bottom = cy + cropSpan / 2;
    }

    [left, top, right, bottom] = expandCropBox(left, top, right, bottom, imgW, imgH);
    if (left <= 0 && top <= 0 && right >= imgW && bottom >= imgH) {
      return { bytes: imgBytes, width, height, mapView };
    }

    const cropW = right - left;
    const cropH = bottom - top;
    const canvas = createCanvas(cropW, cropH);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, left, top, cropW, cropH, 0, 0, cropW, cropH);
    const [centerLat, centerLng] = staticMapLatLng(left + cropW / 2, top + cropH / 2, mapView.center_lat, mapView.center_lng, mapView.zoom, width, height);

    return {
      bytes: canvas.toBuffer("image/png"),
      width: cropW,
      height: cropH,
      mapView: { ...mapView, center_lat: centerLat, center_lng: centerLng, crop_box_px: [left, top, right, bottom], cropped: true },
    };
  } catch {
    return { bytes: imgBytes, width, height, mapView };
  }
}

export async function imageHasBlackTileRegion(imgBytes: Buffer): Promise<boolean> {
  try {
    const image = await loadImage(imgBytes);
    const size = 80;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, size, size);
    const regions: [number, number, number, number][] = [
      [Math.floor(size * 0.6), 0, size, size],
      [0, Math.floor(size * 0.6), size, size],
    ];
    for (const [l, t, rgt, bot] of regions) {
      const w = rgt - l;
      const h = bot - t;
      const { data } = ctx.getImageData(l, t, w, h);
      const total = w * h;
      if (!total) continue;
      let blackish = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 8 && data[i + 1] < 8 && data[i + 2] < 8) blackish += 1;
      }
      if (blackish / total > 0.55) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function footprintImagePolygons(mapView: MapView, width: number, height: number): [Pt[], Pt[]] {
  const footprint = mapView.footprint ?? [];
  if (footprint.length < 3) return [[], []];
  const px = footprint.map((p) => staticMapPixel(p[0], p[1], mapView.center_lat, mapView.center_lng, mapView.zoom, width, height));
  const pct = px.map(([x, y]) => [Math.round((x / width) * 10000) / 100, Math.round((y / height) * 10000) / 100] as Pt);
  return [px, pct];
}

export function pctPolygonToGeo(polyPct: Pt[], mapView: MapView, width: number, height: number): Pt[] {
  return polyPct.map(([xPct, yPct]) => {
    const [lat, lng] = staticMapLatLng((xPct / 100) * width, (yPct / 100) * height, mapView.center_lat, mapView.center_lng, mapView.zoom, width, height);
    return [Math.round(lat * 1e7) / 1e7, Math.round(lng * 1e7) / 1e7] as Pt;
  });
}

export async function annotateImageForRoofVision(imgBytes: Buffer, footprintPx: Pt[], clickPx: Pt | null): Promise<{ b64: string; mediaType: string }> {
  try {
    const image = await loadImage(imgBytes);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    if (footprintPx.length >= 3) {
      const drawRing = (color: string, lineWidth: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(footprintPx[0][0], footprintPx[0][1]);
        for (let i = 1; i < footprintPx.length; i++) ctx.lineTo(footprintPx[i][0], footprintPx[i][1]);
        ctx.closePath();
        ctx.stroke();
      };
      drawRing("rgba(0,255,150,0.90)", 6);
      drawRing("rgba(255,255,255,0.86)", 2);
    }
    if (clickPx) {
      const [cx, cy] = clickPx;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,210,0,0.96)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(20,20,20,1)";
      ctx.stroke();
    }
    return { b64: canvas.toBuffer("image/png").toString("base64"), mediaType: "image/png" };
  } catch {
    return { b64: imgBytes.toString("base64"), mediaType: "image/png" };
  }
}
