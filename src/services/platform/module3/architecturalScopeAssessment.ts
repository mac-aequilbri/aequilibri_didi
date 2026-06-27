import { callClaude } from "@/lib/claude";
import { loadTradeOptions } from "@/lib/platform/configSource";
import { emitCorrection } from "@/lib/platform/corrections";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord, type RecordId } from "@/lib/platform/recordWriter";
import type { OrgCtx } from "@/lib/platform/types";
import { generateManagedDocument } from "@/services/platform/documents";
import type { Module3RunResult } from "./engine";
import { loadCapabilityDocuments } from "./shared";

export interface ArchitecturalScopeAssessmentInput {
  jobId: RecordId;
  documentIds: RecordId[];
  zone?: string;
  title?: string;
}

interface RoomExtract {
  room: string;
  areaSqm?: number;
  impliedTrades: string[];
}

const ROOM_HINTS = [
  "bedroom",
  "kitchen",
  "bathroom",
  "ensuite",
  "living",
  "dining",
  "laundry",
  "study",
  "garage",
  "alfresco",
  "corridor",
  "hallway",
];

function parseArea(line: string): number | undefined {
  const direct = line.match(/\b([0-9]+(?:\.[0-9]+)?)\s*m2\b/i);
  if (direct) return Number(direct[1]);
  const byDims = line.match(/\b([0-9]+(?:\.[0-9]+)?)\s*[x×]\s*([0-9]+(?:\.[0-9]+)?)\b/i);
  if (!byDims) return undefined;
  const area = Number(byDims[1]) * Number(byDims[2]);
  return Number.isFinite(area) && area > 0 ? Math.round(area * 100) / 100 : undefined;
}

function extractRooms(text: string, trades: string[]): RoomExtract[] {
  const lines = text.split(/\r?\n/);
  const out: RoomExtract[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    const roomHint = ROOM_HINTS.find((h) => lower.includes(h));
    if (!roomHint) continue;
    const name = line.slice(0, 80);
    const area = parseArea(line);
    const impliedTrades = trades.filter((t) => lower.includes(t.toLowerCase()));
    out.push({ room: name, areaSqm: area, impliedTrades });
  }
  return out;
}

/** Coerce the model's rooms array into validated RoomExtract rows. */
function coerceRooms(parsed: unknown): RoomExtract[] {
  if (!parsed || typeof parsed !== "object") return [];
  const rs = (parsed as { rooms?: unknown }).rooms;
  if (!Array.isArray(rs)) return [];
  const out: RoomExtract[] = [];
  for (const raw of rs as Array<{ room?: unknown; areaSqm?: unknown; impliedTrades?: unknown }>) {
    const room = String(raw?.room ?? "").trim().slice(0, 80);
    if (!room) continue;
    const areaNum = Number(raw?.areaSqm);
    const areaSqm = Number.isFinite(areaNum) && areaNum > 0 ? Math.round(areaNum * 100) / 100 : undefined;
    const impliedTrades = Array.isArray(raw?.impliedTrades)
      ? Array.from(
          new Set((raw.impliedTrades as unknown[]).map((t) => String(t).trim()).filter(Boolean)),
        ).slice(0, 20)
      : [];
    out.push({ room, areaSqm, impliedTrades });
  }
  return out;
}

/** Recognise rooms + implied scope from one architectural document using Claude
 *  (the spec's room-by-room recognition + scope inference). Returns null when
 *  the model is unavailable or the reply can't be parsed, so the caller falls
 *  back to the heuristic line scanner. */
async function extractRoomsViaClaude(
  docTitle: string,
  docText: string,
  trades: string[],
): Promise<RoomExtract[] | null> {
  const { system } = getPrompt("scope.extract");
  const user =
    `Canonical trades:\n${trades.join(", ") || "(none provided)"}\n\n` +
    `Architectural document "${docTitle}":\n${docText.slice(0, 12000)}`;
  let res;
  try {
    res = await callClaude(system, user, { model: modelFor("extraction"), maxTokens: 2000 });
  } catch {
    return null;
  }
  if (res.demo_mode) return null;
  try {
    const parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
    const rooms = coerceRooms(parsed);
    return rooms.length ? rooms : null;
  } catch {
    return null;
  }
}

export async function runArchitecturalScopeAssessment(
  ctx: OrgCtx,
  userName: string,
  input: ArchitecturalScopeAssessmentInput,
): Promise<Module3RunResult> {
  if (!input.jobId) throw new Error("Job is required.");
  const docs = await loadCapabilityDocuments(ctx, input.documentIds, input.jobId);
  if (docs.length === 0) throw new Error("No architectural documents found.");

  const tradeOptions = await loadTradeOptions(ctx);
  const trades = tradeOptions.map((t) => t.name).filter(Boolean);

  const rooms: RoomExtract[] = [];
  let aiExtractions = 0;
  for (const d of docs) {
    const ai = await extractRoomsViaClaude(d.title, d.text, trades);
    if (ai) {
      aiExtractions += 1;
      rooms.push(...ai);
    } else {
      rooms.push(...extractRooms(d.text, trades));
    }
  }
  if (rooms.length === 0) {
    throw new Error("No room/scope signals found in selected documents.");
  }
  const extractionMethod =
    aiExtractions === docs.length ? "ai" : aiExtractions > 0 ? "mixed" : "heuristic";

  const uniqueRooms = Array.from(
    new Map(
      rooms.map((r) => [
        r.room.toLowerCase(),
        {
          ...r,
          impliedTrades: Array.from(new Set(r.impliedTrades)),
        },
      ]),
    ).values(),
  );

  let createdRooms = 0;
  for (const room of uniqueRooms) {
    const result = await writeRecord(ctx, {
      table: "room",
      op: "create",
      data: {
        jobId: input.jobId,
        zone: input.zone?.trim() || "Architectural",
        name: room.room,
        areaSqm: room.areaSqm,
        finishes: JSON.stringify({ impliedTrades: room.impliedTrades }),
        notes: "Auto-created by Architectural Scope Assessment capability.",
      },
      actor: { type: "ai", name: "Architectural Scope Capability" },
    });
    if (result.recordId != null) createdRooms += 1;
  }

  const missingArea = uniqueRooms.filter((r) => r.areaSqm == null);
  let actionId: RecordId | undefined;
  if (missingArea.length > 0) {
    const action = await writeRecord(ctx, {
      table: "action",
      op: "create",
      data: {
        jobId: input.jobId,
        title: "Review missing room dimensions from architectural intake",
        detail: `Missing measured area for: ${missingArea.map((r) => r.room).join(", ")}`,
        priority: "P2",
        status: "open",
        owner: userName,
        sourceType: "ai",
        context: JSON.stringify({ capability: "architectural_scope_assessment" }),
      },
      actor: { type: "ai", name: "Architectural Scope Capability" },
      requireApproval: true,
    });
    actionId = action.proposalId ?? action.recordId;
  }

  const payload = {
    capability: "architectural_scope_assessment",
    generatedAt: new Date().toISOString(),
    extraction: { method: extractionMethod, aiDocuments: aiExtractions, totalDocuments: docs.length },
    sourceDocumentIds: docs.map((d) => d.id),
    rooms: uniqueRooms,
    createdRooms,
    missingAreaRooms: missingArea.map((r) => r.room),
    followUpActionProposalId: actionId,
  };

  const generated = await generateManagedDocument(ctx, userName, {
    jobId: input.jobId,
    title: input.title?.trim() || `Architectural scope assessment (${new Date().toISOString().slice(0, 10)})`,
    docType: "scope_assessment",
    outputType: "architectural_scope_report",
    format: "pdf",
    body: JSON.stringify(payload, null, 2),
    traceability: {
      sourceModule: "module3.architectural_scope_assessment",
      sourceRecordId: input.jobId,
    },
  });
  if (!generated.id) throw new Error("Failed to persist architectural scope output.");

  if (missingArea.length > 0) {
    await emitCorrection(
      ctx,
      { type: "system", name: "Architectural Scope Capability" },
      {
        entityType: "module3_capability",
        dimension: "scope.room_area",
        aiValueText: "missing",
        humanValueText: missingArea.map((r) => r.room).join(", "),
        rootCause: "architectural document omitted dimensions for one or more rooms",
        context: { capability: "architectural_scope_assessment", jobId: String(input.jobId) },
      },
    );
  }

  const method = extractionMethod === "ai" ? "AI" : extractionMethod === "mixed" ? "mixed AI/heuristic" : "heuristic";
  const aiBonus = extractionMethod === "ai" ? 10 : extractionMethod === "mixed" ? 5 : 0;
  return {
    capability: "architectural_scope_assessment",
    resultId: generated.id,
    overallConfidence: Math.max(35, Math.min(95, 55 + aiBonus + uniqueRooms.length - missingArea.length * 5)),
    outputVersion: "module3.architectural-scope@2.0",
    notes: `Created ${createdRooms} room scope rows (${method} extraction).`,
  };
}
