import { NextResponse } from "next/server";
import { fullSolarAnalysis } from "@/services/uc1/solar";

export const dynamic = "force-dynamic";

// POST { lat, lng, storeys?, solar_panels?, solar_hw? } → Google Solar analysis.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "lat/lng required" }, { status: 400 });
    }
    const result = await fullSolarAnalysis(
      lat,
      lng,
      Number(body.storeys ?? 1),
      Boolean(body.solar_panels),
      Boolean(body.solar_hw),
    );
    return NextResponse.json(result);
  } catch (exc) {
    return NextResponse.json({ ok: false, error: String(exc) }, { status: 400 });
  }
}
