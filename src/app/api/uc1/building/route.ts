import { NextResponse } from "next/server";
import { lookupBuildingFootprint } from "@/services/uc1/footprints";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// GET /api/uc1/building?lat=&lon=&address=
// Best building footprint near a point (Geoscape, then local Microsoft-ML
// footprints). Interactive: skips the slow on-demand MS tile download and is
// hard-capped at 12s so a slow Geoscape call can never freeze the wizard.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ found: false, error: "Invalid coordinates" }, { status: 400 });
  }
  const address = (searchParams.get("address") ?? "").trim();
  // ?deep=1 enables the slow Microsoft-ML tile import (non-interactive use).
  const importTiles = searchParams.get("deep") === "1";

  const fallback: { payload: Json; status: number } = {
    payload: { found: false, source: "none", message: "Lookup timed out — try clicking the roof directly." },
    status: 200,
  };
  try {
    const { payload, status } = await withTimeout(lookupBuildingFootprint(lat, lon, address, { importTiles }), 12_000, fallback);
    return NextResponse.json(payload, { status });
  } catch (exc) {
    return NextResponse.json({ found: false, error: String(exc) }, { status: 200 });
  }
}
