import { loadTradeOptions } from "@/lib/platform/configSource";
import { emitCorrection } from "@/lib/platform/corrections";
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
  const rooms = docs.flatMap((d) => extractRooms(d.text, trades));
  if (rooms.length === 0) {
    throw new Error("No room/scope signals found in selected documents.");
  }

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

  return {
    capability: "architectural_scope_assessment",
    resultId: generated.id,
    overallConfidence: Math.max(35, Math.min(95, 55 + uniqueRooms.length - missingArea.length * 5)),
    outputVersion: "module3.architectural-scope@1.0",
    notes: `Created ${createdRooms} room scope rows.`,
  };
}
