// Meeting-minutes detail data source — Postgres (default) or Airtable when the
// flag is on. Backs /app/[org]/meeting-minutes/[id]. id is a numeric PK in
// Postgres mode and a "rec…" record id in Airtable mode; the confirm form posts
// that same id back (confirmMeetingMinutes is RecordId-aware). extractedActions
// is stored as a JSON string in both backends and parsed here. jobCode is empty
// in Airtable mode (Airtable JOBS has no code field — see plan P4).

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import type { ExtractedAction } from "@/services/platform/construction/minutes";
import type { OrgCtx } from "./types";

export interface MinutesDetailView {
  id: string;
  title: string;
  meetingDate: Date | null;
  attendees: string;
  status: string;
  rawMinutes: string;
  extractedActions: ExtractedAction[];
  confirmedAt: Date | null;
  jobCode: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function dateOrNull(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Parse the stored JSON action list, tolerating malformed/empty content. */
function parseActions(raw: unknown): ExtractedAction[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExtractedAction[]) : [];
  } catch {
    return [];
  }
}

async function fromPostgres(ctx: OrgCtx, id: string): Promise<MinutesDetailView | null> {
  const recId = Number(id);
  if (!Number.isInteger(recId)) return null;
  const minutes = await prisma.platConMeetingMinutes.findFirst({
    where: { id: recId, orgId: ctx.orgId },
    include: { job: { select: { code: true } } },
  });
  if (!minutes) return null;
  return {
    id: String(minutes.id),
    title: minutes.title,
    meetingDate: minutes.meetingDate,
    attendees: minutes.attendees,
    status: minutes.status,
    rawMinutes: minutes.rawMinutes,
    extractedActions: parseActions(minutes.extractedActions),
    confirmedAt: minutes.confirmedAt,
    jobCode: minutes.job?.code ?? "",
  };
}

async function fromAirtable(ctx: OrgCtx, id: string): Promise<MinutesDetailView | null> {
  if (!id.startsWith("rec")) return null;
  let minutes;
  try {
    minutes = await core.get(ctx.orgSlug, "MEETING_MINUTES", id);
  } catch {
    return null; // 404 / deleted / wrong-base → not found
  }
  return {
    id: minutes.id,
    title: str(minutes["Title"]),
    meetingDate: dateOrNull(minutes["Meeting_Date"]),
    attendees: str(minutes["Attendees"]),
    status: str(minutes["Status"]) || "raw",
    rawMinutes: str(minutes["Raw_Minutes"]),
    extractedActions: parseActions(minutes["Extracted_Actions"]),
    confirmedAt: dateOrNull(minutes["Confirmed_At"]),
    jobCode: "", // Airtable JOBS has no code field (see plan P4)
  };
}

/** Load a single meeting-minutes detail view from whichever backend is active. */
export function loadMinutesDetail(ctx: OrgCtx, id: string): Promise<MinutesDetailView | null> {
  return airtableEnabled() ? fromAirtable(ctx, id) : fromPostgres(ctx, id);
}
