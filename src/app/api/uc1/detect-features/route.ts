import { NextResponse } from "next/server";
import { callClaudeVision, callClaudeVisionMulti, type VisionImage } from "@/lib/claude";

export const dynamic = "force-dynamic";

// POST { lat, lng, roof_image_b64?, roof_media_type? }
// Fetches a satellite image + 2-direction Street Views and sends them to Claude
// Vision for rooftop feature detection. Port of api_views.detect_roof_features.

const SOLAR_PANEL_GUIDANCE =
  "═══ SOLAR PANEL DETECTION — DEFAULT TO TRUE IF YOU SEE ANY DARK RECTANGLE ═══\n" +
  "BUSINESS-CRITICAL RULE (READ FIRST):\n" +
  "  If the aerial image contains ANY of these on the target roof, set " +
  "  solar_panels=TRUE. Do NOT say false unless you are 100% certain the roof is " +
  "  bare. A false-negative kills our solar-upsell revenue. A false-positive is " +
  "  trivially corrected by the site inspector.\n\n" +
  "Visual cues — say TRUE if you see ANY of:\n" +
  "  ✓ A dark blue, dark grey, or black rectangle on the roof that is clearly darker than the surrounding roof\n" +
  "  ✓ A grid-like pattern of small dark cells (3×4, 4×5, 4×8 layouts common)\n" +
  "  ✓ A flat dark patch on a corrugated-iron roof that interrupts the ribbing\n" +
  "  ✓ Multiple rectangles arranged in a row or block on one roof slope\n" +
  "  ✓ Even ONE row of 4+ panel-like rectangles\n\n" +
  "ONLY say solar_panels=FALSE if you are confident the entire roof surface is bare.\n" +
  "When you say TRUE, confidence='medium' is acceptable. Bias the judgement toward TRUE.";

const BASE_JSON =
  '"solar_panels": true/false, "solar_panels_confidence": "high/medium/low", ' +
  '"solar_hw": true/false, "solar_hw_confidence": "high/medium/low", ' +
  '"roof_style": "gable/hip/flat/skillion/mansard/unknown", "roof_style_confidence": "high/medium/low", ' +
  '"roof_material": "terracotta_tiles/concrete_tiles/metal_colorbond/asphalt/slate/unknown", "roof_material_confidence": "high/medium/low", ' +
  '"pitch_deg": 20, "storeys": 1, "eave_height_m": 3.0, "condition": "good/fair/poor/unknown", ' +
  '"other_features": ["list or empty array"], "notes": "one sentence summary"';

const SV_HEADINGS: [number, string][] = [
  [0, "NORTH"],
  [180, "SOUTH"],
];
const SV_DESCRIPTIONS: Record<string, string> = {
  sv_north: "camera faces North — reveals south-facing facade and south roof slope",
  sv_south: "camera faces South — reveals north-facing (street) facade and north slope",
};

async function fetchB64(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "aequilibri/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let lat: number, lng: number, roofImageB64: string, roofMediaType: string;
  try {
    const body = await request.json();
    lat = Number(body.lat);
    lng = Number(body.lng);
    roofImageB64 = body.roof_image_b64 ?? "";
    roofMediaType = body.roof_media_type ?? "image/png";
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("lat/lng required");
  } catch (exc) {
    return NextResponse.json({ error: String(exc) }, { status: 400 });
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
  const images: VisionImage[] = [];

  // 1. Aerial — prefer the cropped roof drawing image when supplied.
  if (roofImageB64) {
    images.push({ b64: roofImageB64, media_type: roofMediaType, label: "aerial" });
  } else if (googleKey) {
    const b64 = await fetchB64(
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&maptype=satellite&key=${googleKey}`,
      10_000,
    );
    if (b64) images.push({ b64, media_type: "image/png", label: "aerial" });
  }

  // 2. Street View availability.
  let svAvailable = false;
  if (googleKey) {
    try {
      const resp = await fetch(
        `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=100&source=outdoor&key=${googleKey}`,
        { headers: { "User-Agent": "aequilibri/1.0" }, signal: AbortSignal.timeout(8_000) },
      );
      svAvailable = resp.ok && (await resp.json())?.status === "OK";
    } catch {
      svAvailable = false;
    }
  }

  // 3. Two-direction Street Views.
  if (svAvailable && googleKey) {
    for (const [heading, direction] of SV_HEADINGS) {
      const b64 = await fetchB64(
        `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${lat},${lng}&heading=${heading}&fov=90&pitch=12&source=outdoor&key=${googleKey}`,
        8_000,
      );
      if (b64) images.push({ b64, media_type: "image/jpeg", label: `sv_${direction.toLowerCase()}` });
    }
  }

  const aerialIsCropped = Boolean(roofImageB64);
  const aerialDesc = aerialIsCropped
    ? "a tightly cropped satellite image of the selected roof"
    : "a top-down satellite image of the property";
  const svLabels = images.filter((i) => i.label?.startsWith("sv_")).map((i) => i.label!);

  let result: { content: string; demo_mode: boolean; views_used?: string[] };

  if (!images.length) {
    result = {
      content:
        '{"solar_panels":false,"solar_panels_confidence":"low","solar_hw":false,"solar_hw_confidence":"low",' +
        '"roof_style":"unknown","roof_style_confidence":"low","roof_material":"unknown","roof_material_confidence":"low",' +
        '"pitch_deg":null,"storeys":null,"eave_height_m":null,"condition":"unknown","other_features":[],' +
        '"notes":"No imagery available — manual inspection required."}',
      demo_mode: true,
      views_used: [],
    };
  } else if (svLabels.length) {
    const nSv = svLabels.length;
    const system =
      `You are an expert Australian roof inspector. You will be given ${1 + nSv} images of the same property: ` +
      `${aerialDesc} and ${nSv} street-level views from different compass directions. ` +
      "Respond ONLY with a valid JSON object — no markdown, no extra text.";
    const bullets = [
      `• IMAGE 1 — AERIAL (${aerialDesc}): Look carefully for solar PV panels (dark rectangular grid arrays), ` +
        "solar hot water (flat collector + cylindrical tank), AC units, skylights, pools.",
    ];
    svLabels.forEach((lbl, idx) => {
      const desc = SV_DESCRIPTIONS[lbl] ?? "street-level view";
      bullets.push(`• IMAGE ${idx + 2} — STREET VIEW ${lbl.split("_")[1].toUpperCase()} (${desc}).`);
    });
    const prompt =
      "You have the following images of the same Australian property:\n\n" +
      bullets.join("\n") +
      `\n\n${SOLAR_PANEL_GUIDANCE}\n\nUsing ALL images together:\n` +
      "• Solar panels / hot water → aerial (IMAGE 1)\n• Roof style, material → street views\n" +
      "• Pitch in degrees → measure slope from street views\n• Storey count, eave height → any street view\n" +
      "• Roof condition → street views (moss, cracked tiles, sag, rust)\n\n" +
      "Respond with ONLY this JSON (no markdown fences):\n{" + BASE_JSON + "}";
    const r = await callClaudeVisionMulti(system, prompt, images, { maxTokens: 600, model: "claude-sonnet-4-6" });
    result = { ...r, views_used: ["aerial", ...svLabels] };
  } else {
    const system =
      `You are an expert roof inspector analysing ${aerialDesc} of an Australian residential or commercial property. ` +
      "Respond ONLY with a valid JSON object — no markdown, no extra text.";
    const prompt =
      `Examine this ${aerialDesc} carefully.\n\n${SOLAR_PANEL_GUIDANCE}\n\n` +
      "Also identify: solar hot water, AC units, skylights, pools. Roof style, material and condition are " +
      "difficult from aerial only — set those to 'unknown' unless clearly visible. Set pitch_deg and eave_height_m to null.\n\n" +
      "Respond with ONLY this JSON (no markdown fences):\n{" + BASE_JSON + "}";
    const img = images[0];
    const r = await callClaudeVision(system, prompt, img.b64, { mediaType: img.media_type, maxTokens: 800 });
    result = { ...r, views_used: ["aerial"] };
  }

  // Parse the JSON response (tolerating ```json fences).
  let data: Record<string, unknown>;
  try {
    let raw = result.content.trim();
    if (raw.startsWith("```")) {
      raw = raw.split("```")[1];
      if (raw.startsWith("json")) raw = raw.slice(4);
    }
    data = JSON.parse(raw);
  } catch {
    data = {
      solar_panels: false, solar_panels_confidence: "low", solar_hw: false, solar_hw_confidence: "low",
      roof_style: "unknown", roof_style_confidence: "low", roof_material: "unknown", roof_material_confidence: "low",
      storeys: null, condition: "unknown", other_features: [], notes: "Could not parse AI response.",
    };
  }

  data.demo_mode = result.demo_mode ?? false;
  data.views_used = result.views_used ?? [];
  const notes = String(data.notes ?? "");
  if (["Claude error:", "Could not parse AI response", "No imagery available"].some((m) => notes.includes(m))) {
    data.detection_error = notes;
  }
  return NextResponse.json(data);
}
