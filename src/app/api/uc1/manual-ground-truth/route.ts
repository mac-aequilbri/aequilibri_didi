import { NextResponse } from "next/server";
import {
  MANUAL_GROUND_TRUTH_TOOL,
  findBestMemoryMatch,
  matchResponse,
  saveManualGroundTruth,
  toFloat,
} from "@/services/uc1/correctionMemory";

export const dynamic = "force-dynamic";

// GET — retrieve best matching manual ground-truth record.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const match = await findBestMemoryMatch({
    toolName: MANUAL_GROUND_TRUTH_TOOL,
    address: (searchParams.get("address") ?? "").slice(0, 300),
    lat: toFloat(searchParams.get("lat")),
    lng: toFloat(searchParams.get("lng")),
  });
  return NextResponse.json(matchResponse(match, "ground_truth"));
}

// POST — persist manual/Peter measurement evidence.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = await saveManualGroundTruth(body);
    return NextResponse.json({ ok: true, id });
  } catch (exc) {
    return NextResponse.json({ ok: false, error: String(exc) }, { status: 400 });
  }
}
