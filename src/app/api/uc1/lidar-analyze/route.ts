import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fullRoofAnalysis } from "@/services/uc1/lidar";

export const dynamic = "force-dynamic";

interface Scaffolding {
  required: boolean;
  estimated_linear_m?: number;
  risk_level?: string;
  reason?: string;
}

// POST { lat, lng, polygon, storeys?, solar_panels?, solar_hw?, quote_id? }
// Runs roof analysis and optionally persists it for a quote.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (exc) {
    return NextResponse.json({ error: String(exc) }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const polygon = (body.polygon as number[][]) ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }
  if (polygon.length < 3) {
    return NextResponse.json({ error: "polygon must have at least 3 points" }, { status: 400 });
  }

  const result = await fullRoofAnalysis(
    lat,
    lng,
    polygon,
    Number(body.storeys ?? 1),
    Boolean(body.solar_panels),
    Boolean(body.solar_hw),
  );

  const quoteId = body.quote_id != null ? Number(body.quote_id) : null;
  if (quoteId && Number.isInteger(quoteId)) {
    await persistLidarAnalysis(quoteId, result).catch(() => {});
  }

  return NextResponse.json(result);
}

async function persistLidarAnalysis(quoteId: number, result: Record<string, unknown>): Promise<void> {
  const quote = await prisma.uc1Quote.findUnique({ where: { id: quoteId }, select: { id: true } });
  if (!quote) return;
  const sc = (result.scaffolding as Scaffolding) ?? { required: false };
  const data = {
    perimeterM: Number(result.perimeter_m ?? 0),
    gutteringLinearM: Number(result.guttering_linear_m ?? 0),
    ridgeHeightM: (result.ridge_height_m as number) ?? null,
    eaveHeightM: (result.eave_height_m as number) ?? null,
    heightRangeM: (result.height_range_m as number) ?? null,
    scaffoldingRequired: Boolean(sc.required),
    scaffoldingLinearM: Number(sc.estimated_linear_m ?? 0),
    scaffoldingRiskLevel: String(sc.risk_level ?? "low"),
    scaffoldingReason: String(sc.reason ?? ""),
    structureCount: Number(result.structure_count ?? 1),
    structuresJson: JSON.stringify(result.structures ?? []),
    solarPanels: Boolean(result.solar_panels),
    solarHw: Boolean(result.solar_hw),
    lidarCoverage: String(result.lidar_coverage ?? "none"),
    dataSource: String(result.data_source ?? ""),
    analysisNotes: JSON.stringify(result.analysis_notes ?? []),
    elapsedMs: Number(result.elapsed_ms ?? 0),
  };
  await prisma.uc1RoofLidarAnalysis.upsert({
    where: { quoteId },
    update: data,
    create: { quoteId, ...data },
  });
}
