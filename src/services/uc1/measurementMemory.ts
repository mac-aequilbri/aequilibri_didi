// Structured roof-measurement snapshots captured during quote creation.
// Port of uc1_roofing/services/measurement_memory.create_measurement_snapshot.

import { prisma } from "@/lib/db";
import { normalizeAddressKey, toFloat } from "@/services/uc1/correctionMemory";

const SNAPSHOT_TYPES = new Set(["use_measurements", "quote_form_submit", "quote_generated"]);
const UPDATE_TYPES = new Set(["use_measurements", "measurement_apply", "quote_form_submit"]);

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function int(v: unknown, fallback = 0): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function listLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function jsonStr(v: unknown, fallback: unknown): string {
  try {
    return JSON.stringify(v ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

export interface SnapshotBody {
  [key: string]: unknown;
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
  total_area_m2?: unknown;
  previous_total_area_m2?: unknown;
}

/** Create one measurement snapshot plus the user event that produced it. */
export async function createMeasurementSnapshot(
  body: SnapshotBody,
  opts: { quoteId?: number | null; snapshotType?: string } = {},
): Promise<{ snapshotId: number; updateId: number }> {
  const address = String(body.address ?? "").slice(0, 1000);
  const lat = toFloat(body.lat);
  const lng = toFloat(body.lng);
  const sections = Array.isArray(body.sections) ? body.sections : [];
  const polygon = Array.isArray(body.polygon) ? body.polygon : [];
  const footprint = Array.isArray(body.footprint) ? body.footprint : [];
  const equipment = Array.isArray(body.equipment) ? body.equipment : [];
  const source = String(body.source ?? "roof_measurement_review").slice(0, 80);

  let kind = opts.snapshotType ?? String(body.snapshot_type ?? "use_measurements");
  if (!SNAPSHOT_TYPES.has(kind)) kind = "use_measurements";

  const total = num(body.total_area_m2);
  const previous = num(body.previous_total_area_m2);
  const addressKey = normalizeAddressKey(address).slice(0, 255);

  const snapshot = await prisma.uc1MeasurementSnapshot.create({
    data: {
      quoteId: opts.quoteId ?? null,
      snapshotType: kind,
      source,
      address,
      addressKey,
      lat,
      lng,
      totalAreaM2: total,
      footprintAreaM2: num(body.footprint_area_m2),
      pitchDeg: num(body.pitch_deg ?? body.avg_pitch_deg),
      pitchFactor: num(body.pitch_factor, 1),
      eaveLm: num(body.eave_lm),
      perimeterM: num(body.perimeter_m),
      ridgeLm: num(body.ridge_lm),
      valleyLm: num(body.valley_lm),
      hipLm: num(body.hip_lm),
      rakeLm: num(body.rake_lm),
      storeys: Math.max(1, int(body.storeys, 1)),
      material: String(body.material ?? "").slice(0, 80),
      roofColour: String(body.roof_colour ?? "").slice(0, 80),
      sectionCount: int(body.section_count, listLen(sections)),
      outlineVertices: int(body.outline_vertices, listLen(footprint) || listLen(polygon)),
      equipmentJson: jsonStr(equipment, []),
      polygonJson: jsonStr(polygon.length ? polygon : footprint, []),
      sectionsJson: jsonStr(sections, []),
      payloadJson: jsonStr(body, {}),
    },
  });

  let updateType = String(body.update_type ?? kind);
  if (!UPDATE_TYPES.has(updateType)) updateType = "use_measurements";

  const update = await prisma.uc1MeasurementUpdate.create({
    data: {
      snapshotId: snapshot.id,
      quoteId: opts.quoteId ?? null,
      updateType,
      address,
      addressKey,
      lat,
      lng,
      previousTotalAreaM2: previous,
      newTotalAreaM2: total,
      deltaAreaM2: total - previous,
      changedFieldsJson: jsonStr(body.changed_fields, []),
      payloadJson: jsonStr(body, {}),
    },
  });

  return { snapshotId: snapshot.id, updateId: update.id };
}
