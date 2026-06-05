import { NextResponse } from "next/server";
import { PITCH_FACTORS } from "@/services/uc1/constants";

// GET /api/uc1/area-preview?flat_area=&pitch_type=&waste_factor=
// Mirrors api_views.area_preview — adjusted = flat × pitch_factor × (1 + waste%).
export function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const flatArea = Number(searchParams.get("flat_area") ?? 0);
    const pitchType = searchParams.get("pitch_type") ?? "standard";
    const wasteFactor = Number(searchParams.get("waste_factor") ?? 10);
    const pitchFactor = PITCH_FACTORS[pitchType] ?? 1.0;
    const adjusted = Math.round(flatArea * pitchFactor * (1 + wasteFactor / 100) * 100) / 100;
    return NextResponse.json({ adjusted_area: adjusted, pitch_factor: pitchFactor });
  } catch (exc) {
    return NextResponse.json({ error: String(exc) }, { status: 400 });
  }
}
