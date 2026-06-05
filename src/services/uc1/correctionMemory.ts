// Append-only correction & ground-truth memory backed by the ExecutionLog table.
// Port of uc1_roofing/services/correction_memory.py — matching + payload shaping
// for verified AI roof corrections and manual ground-truth measurements.

import { prisma } from "@/lib/db";

export const ROOF_CORRECTION_TOOL = "roof_correction";
export const MANUAL_GROUND_TRUTH_TOOL = "manual_ground_truth";

type Json = Record<string, unknown>;

interface LogRow {
  id: number;
  payload: string;
  result: string;
  status: string;
  createdAt: Date;
}

export interface MemoryMatch {
  log: LogRow;
  payload: Json;
  score: number;
  distanceM: number | null;
}

export function normalizeAddressKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function distanceM(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
  const radius = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1!);
  const phi2 = toRad(lat2!);
  const dPhi = toRad(lat2! - lat1!);
  const dLng = toRad(lng2! - lng1!);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function decodePayload(log: LogRow): Json | null {
  try {
    const p = JSON.parse(log.payload || "{}");
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Json) : null;
  } catch {
    return null;
  }
}

/** Score a candidate against the query address/point (shared by best + all). */
function scoreCandidate(
  payload: Json,
  addressKey: string,
  lat: number | null,
  lng: number | null,
): { score: number; proximity: number | null } | null {
  let addressScore = 0;
  const candidateKey = normalizeAddressKey(payload.address);
  if (addressKey && candidateKey) {
    if (addressKey === candidateKey) addressScore = 1000;
    else if (addressKey.length > 10 && (candidateKey.includes(addressKey) || addressKey.includes(candidateKey)))
      addressScore = 850;
  }

  const proximity = distanceM(lat, lng, toFloat(payload.lat), toFloat(payload.lng));

  // Neighbour-guard: differing-but-known addresses must be within 10 m to match.
  if (addressScore === 0 && addressKey && candidateKey) {
    if (proximity === null || proximity > 10) return null;
  }

  let score = addressScore;
  if (proximity !== null) {
    if (proximity <= 8) score += 900;
    else if (proximity <= 30) score += 750;
    else if (proximity <= 75) score += 350;
  }
  return { score, proximity };
}

async function recentLogs(toolName: string, limit: number): Promise<LogRow[]> {
  return prisma.uc1ExecutionLog.findMany({
    where: { toolName, status: "success" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, payload: true, result: true, status: true, createdAt: true },
  });
}

export async function findBestMemoryMatch(opts: {
  toolName: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
  minScore?: number;
}): Promise<MemoryMatch | null> {
  const { toolName, address = "", lat = null, lng = null, limit = 300, minScore = 500 } = opts;
  const addressKey = normalizeAddressKey(address);
  let best: MemoryMatch | null = null;

  for (const log of await recentLogs(toolName, limit)) {
    const payload = decodePayload(log);
    if (!payload) continue;
    const scored = scoreCandidate(payload, addressKey, lat, lng);
    if (!scored) continue;
    if (best === null || scored.score > best.score) {
      best = { log, payload, score: scored.score, distanceM: scored.proximity };
    }
  }

  if (best === null || best.score < minScore) return null;
  return best;
}

async function findAllMatchingCorrections(opts: {
  address?: string;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
  minScore?: number;
}): Promise<LogRow[]> {
  const { address = "", lat = null, lng = null, limit = 1000, minScore = 500 } = opts;
  const addressKey = normalizeAddressKey(address);
  const matches: LogRow[] = [];
  for (const log of await recentLogs(ROOF_CORRECTION_TOOL, limit)) {
    const payload = decodePayload(log);
    if (!payload) continue;
    const scored = scoreCandidate(payload, addressKey, lat, lng);
    if (scored && scored.score >= minScore) matches.push(log);
  }
  return matches;
}

export function matchResponse(match: MemoryMatch | null, payloadKey: string): Json {
  if (match === null) return { ok: true, found: false };
  return {
    ok: true,
    found: true,
    id: match.log.id,
    created_at: match.log.createdAt.toISOString(),
    match_score: match.score,
    distance_m: match.distanceM !== null ? Math.round(match.distanceM * 100) / 100 : null,
    [payloadKey]: match.payload,
  };
}

export async function saveRoofCorrection(body: Json): Promise<number> {
  const sections = (body.sections as unknown[]) ?? [];
  const footprint = (body.footprint as unknown[]) ?? [];
  const quality = (body.quality as Json) ?? {};
  const address = String(body.address ?? "").slice(0, 300);
  const payload = {
    address,
    lat: body.lat,
    lng: body.lng,
    footprint,
    drawing_boundary_pct: body.drawing_boundary_pct ?? [],
    sections,
    quality,
    footprint_area_m2: body.footprint_area_m2,
    total_area_m2: body.total_area_m2,
    perimeter_m: body.perimeter_m,
    avg_pitch_deg: body.avg_pitch_deg,
    source: body.source ?? "ai_roof_drawing",
    notes: body.notes ?? "",
  };
  const log = await prisma.uc1ExecutionLog.create({
    data: {
      toolName: ROOF_CORRECTION_TOOL,
      payload: JSON.stringify(payload),
      result: JSON.stringify({
        ok: true,
        address,
        section_count: Array.isArray(sections) ? sections.length : 0,
        outline_vertices: Array.isArray(footprint) ? footprint.length : 0,
        quality_level: typeof quality === "object" ? (quality as Json).level ?? "" : "",
      }),
      status: "success",
    },
  });
  return log.id;
}

export async function deleteRoofCorrection(opts: {
  address?: string;
  lat?: number | null;
  lng?: number | null;
  logId?: number | null;
}): Promise<number> {
  const { address = "", lat = null, lng = null, logId = null } = opts;
  if (logId !== null) {
    const { count } = await prisma.uc1ExecutionLog.deleteMany({
      where: { id: logId, toolName: ROOF_CORRECTION_TOOL },
    });
    return count;
  }
  const matches = await findAllMatchingCorrections({ address, lat, lng });
  if (matches.length === 0) return 0;
  const { count } = await prisma.uc1ExecutionLog.deleteMany({
    where: { id: { in: matches.map((m) => m.id) } },
  });
  return count;
}

export async function saveManualGroundTruth(body: Json): Promise<number> {
  const fields = (body.fields as Json) && typeof body.fields === "object" ? (body.fields as Json) : {};
  const address = String(body.address ?? "").slice(0, 300);
  const payload = {
    address,
    lat: body.lat,
    lng: body.lng,
    sample_id: body.sample_id ?? "",
    source: body.source ?? "peter_manual_sheet",
    fields,
    raw_measurements: body.raw_measurements ?? "",
    notes: body.notes ?? "",
  };
  const log = await prisma.uc1ExecutionLog.create({
    data: {
      toolName: MANUAL_GROUND_TRUTH_TOOL,
      payload: JSON.stringify(payload),
      result: JSON.stringify({
        ok: true,
        address,
        field_count: Object.values(fields).filter((v) => v !== "" && v !== null).length,
      }),
      status: "success",
    },
  });
  return log.id;
}
