// Meeting minutes ↔ DOCUMENTS mapping (Spec 12 reconciliation).
//
// Spec 12 dropped the legacy MEETING_MINUTES table. Minutes are now a DOCUMENTS
// row (Module 2 correspondence): the raw minutes in Text_Content, and the
// meeting metadata + extracted actions + raw→processed→confirmed lifecycle in
// AI_Analysis under a `minutes` block. Confirming the minutes creates real ISSUES
// (Action Hub) rows, the Spec 12 Module 2 "route operational content" pattern.
// The Postgres backend keeps the rich plat_con_meetingminutes model; this module
// is the shared shape for the Airtable path (service + read sources).

/** Airtable Document_Type for a meeting-minutes row (unique so reads can narrow
 *  before confirming the block kind — "correspondence" is shared with notes). */
export const MINUTES_DOC_TYPE = "Meeting Minutes";

export interface ExtractedAction {
  title: string;
  owner: string;
  dueDate: string | null;
}

export interface MinutesModule {
  kind: "meeting_minutes";
  meetingDate: string;
  attendees: string;
  status: "raw" | "processed" | "confirmed";
  extractedActions: ExtractedAction[];
  actionsCount: number;
  confirmedAt?: string;
}

/** Serialize minutes metadata into the DOCUMENTS AI_Analysis cell. */
export function buildMinutesAnalysis(m: MinutesModule): string {
  return JSON.stringify({ minutes: m });
}

/** Parse a DOCUMENTS AI_Analysis cell into minutes metadata, or null if the row
 *  is not a meeting-minutes record. Tolerant of malformed JSON. */
export function parseMinutesModule(aiAnalysis: unknown): MinutesModule | null {
  if (typeof aiAnalysis !== "string" || !aiAnalysis.trim()) return null;
  try {
    const parsed = JSON.parse(aiAnalysis) as { minutes?: Partial<MinutesModule> };
    const m = parsed.minutes;
    if (!m || m.kind !== "meeting_minutes") return null;
    const status = m.status === "processed" || m.status === "confirmed" ? m.status : "raw";
    return {
      kind: "meeting_minutes",
      meetingDate: typeof m.meetingDate === "string" ? m.meetingDate : "",
      attendees: typeof m.attendees === "string" ? m.attendees : "",
      status,
      extractedActions: Array.isArray(m.extractedActions)
        ? (m.extractedActions as ExtractedAction[])
        : [],
      actionsCount: typeof m.actionsCount === "number" ? m.actionsCount : 0,
      confirmedAt: typeof m.confirmedAt === "string" ? m.confirmedAt : undefined,
    };
  } catch {
    return null;
  }
}

/** Merge changes into an existing minutes block and re-serialize. */
export function patchMinutesAnalysis(existing: unknown, patch: Partial<MinutesModule>): string {
  const base = parseMinutesModule(existing) ?? {
    kind: "meeting_minutes" as const,
    meetingDate: "",
    attendees: "",
    status: "raw" as const,
    extractedActions: [],
    actionsCount: 0,
  };
  return buildMinutesAnalysis({ ...base, ...patch });
}
