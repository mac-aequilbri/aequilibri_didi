import { NextResponse } from "next/server";
import {
  ROOF_CORRECTION_TOOL,
  findBestMemoryMatch,
  matchResponse,
  saveRoofCorrection,
  deleteRoofCorrection,
  toFloat,
} from "@/services/uc1/correctionMemory";

export const dynamic = "force-dynamic";

// GET — find best matching correction by address / lat / lng.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const match = await findBestMemoryMatch({
    toolName: ROOF_CORRECTION_TOOL,
    address: (searchParams.get("address") ?? "").slice(0, 300),
    lat: toFloat(searchParams.get("lat")),
    lng: toFloat(searchParams.get("lng")),
  });
  return NextResponse.json(matchResponse(match, "correction"));
}

// POST — save a new correction.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = await saveRoofCorrection(body);
    return NextResponse.json({ ok: true, id });
  } catch (exc) {
    return NextResponse.json({ ok: false, error: String(exc) }, { status: 400 });
  }
}

// DELETE — remove matching correction(s). Accepts JSON body or query params.
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }
  const address = String(body.address ?? searchParams.get("address") ?? "").slice(0, 300);
  const lat = toFloat("lat" in body ? body.lat : searchParams.get("lat"));
  const lng = toFloat("lng" in body ? body.lng : searchParams.get("lng"));
  const idRaw = "id" in body ? body.id : searchParams.get("id");
  const logId = idRaw !== null && idRaw !== undefined && idRaw !== "" ? Number(idRaw) : null;

  try {
    const deleted = await deleteRoofCorrection({
      address,
      lat,
      lng,
      logId: Number.isInteger(logId) ? logId : null,
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (exc) {
    return NextResponse.json({ ok: false, error: String(exc) }, { status: 500 });
  }
}
