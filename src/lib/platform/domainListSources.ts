// Domain-tier list-page data sources — Postgres (default) or the Airtable
// Domain Extension tables when AIRTABLE_MIGRATION is enabled. Groups the simple
// read-only list pages (Variations, Room Matrix, Meeting Minutes, Quotes,
// Weekly Reports) behind uniform view models. Detail pages and AI-generate
// actions are not source-switched yet — only the list reads.

import { airtableEnabled, core } from "@/lib/airtable";
import type { CoreRow } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import { listOptional } from "./optionalList";
import type { EditorValues } from "./recordEditor";
import type { OrgCtx } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

// ── Variation Orders ───────────────────────────────────────────────────
export interface VariationView {
  id: string;
  refNumber: string;
  title: string;
  jobCode: string | null;
  isAiDrafted: boolean;
  costImpact: number;
  timeImpactDays: number;
  status: string;
}

export async function loadVariations(ctx: OrgCtx): Promise<VariationView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.platConVariationOrder.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      include: { job: { select: { code: true } } },
    });
    return rows.map((v) => ({
      id: String(v.id),
      refNumber: v.refNumber,
      title: v.title,
      jobCode: v.job?.code ?? null,
      isAiDrafted: v.isAiDrafted,
      costImpact: toNum(v.costImpact),
      timeImpactDays: v.timeImpactDays,
      status: v.status,
    }));
  }
  const rows = await listOptional(ctx.orgSlug, "VARIATIONS", { maxRecords: 200 });
  return rows.map((r) => ({
    id: r.id,
    refNumber: str(r["Ref_Number"]),
    title: str(r["Title"]) || "(untitled variation)",
    jobCode: null,
    isAiDrafted: false,
    costImpact: num(r["Cost_Impact"]),
    timeImpactDays: num(r["Time_Impact_Days"]),
    status: str(r["Status"]) || "draft",
  }));
}

// ── Room Matrix ────────────────────────────────────────────────────────
export interface RoomView {
  id: string;
  name: string;
  zone: string;
  jobCode: string | null;
  areaSqm: number | null;
  ceilingHeight: string;
  /** JSON string of finishes (the page parses it). */
  finishes: string;
}

export async function loadRoomMatrix(ctx: OrgCtx): Promise<RoomView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.platConRoomMatrix.findMany({
      where: { orgId: ctx.orgId },
      orderBy: [{ zone: "asc" }, { name: "asc" }],
      include: { job: { select: { code: true } } },
    });
    return rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      zone: r.zone,
      jobCode: r.job?.code ?? null,
      areaSqm: r.areaSqm,
      ceilingHeight: r.ceilingHeight,
      finishes: r.finishes,
    }));
  }
  const rows = await listOptional(ctx.orgSlug, "ROOM_MATRIX", { maxRecords: 200 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Room_Name"]) || "(unnamed room)",
    zone: str(r["Zone"]),
    jobCode: null,
    areaSqm: typeof r["Area_Sqm"] === "number" ? (r["Area_Sqm"] as number) : null,
    ceilingHeight: str(r["Ceiling_Height"]),
    finishes: "{}", // no finishes field in the Airtable table yet
  }));
}

/** Form-ready values for a single room's edit page. Limited to the fields the
 *  Airtable ROOM_MATRIX table is known to carry (Finishes has no field yet). */
export async function loadRoomDetail(ctx: OrgCtx, id: string): Promise<EditorValues | null> {
  if (airtableEnabled()) {
    let r: CoreRow | null = null;
    try {
      r = await core.get(ctx.orgSlug, "ROOM_MATRIX", id);
    } catch {
      return null;
    }
    if (!r) return null;
    return {
      name: str(r["Room_Name"]),
      zone: str(r["Zone"]),
      areaSqm: typeof r["Area_Sqm"] === "number" ? (r["Area_Sqm"] as number) : "",
      ceilingHeight: str(r["Ceiling_Height"]),
    };
  }
  const r = await prisma.platConRoomMatrix.findFirst({ where: { id: Number(id), orgId: ctx.orgId } });
  if (!r) return null;
  return {
    name: r.name,
    zone: r.zone,
    areaSqm: r.areaSqm ?? "",
    ceilingHeight: r.ceilingHeight,
  };
}

// ── Meeting Minutes ────────────────────────────────────────────────────
export interface MinutesView {
  id: string;
  title: string;
  meetingDate: Date | string | null;
  jobCode: string | null;
  actionsCount: number;
  status: string;
}

export async function loadMeetingMinutes(ctx: OrgCtx): Promise<MinutesView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.platConMeetingMinutes.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { meetingDate: "desc" },
      include: { job: { select: { code: true } } },
    });
    return rows.map((m) => ({
      id: String(m.id),
      title: m.title,
      meetingDate: m.meetingDate,
      jobCode: m.job?.code ?? null,
      actionsCount: m.actionsCount,
      status: m.status,
    }));
  }
  const rows = await listOptional(ctx.orgSlug, "MEETING_MINUTES", { maxRecords: 200 });
  return rows.map((r) => ({
    id: r.id,
    title: str(r["Title"]),
    meetingDate: str(r["Meeting_Date"]) || null,
    jobCode: null,
    actionsCount: num(r["Actions_Count"]),
    status: str(r["Status"]) || "raw",
  }));
}

// ── Quotes ─────────────────────────────────────────────────────────────
export interface QuoteView {
  id: string;
  refNumber: string;
  title: string;
  clientName: string;
  jobCode: string;
  validUntil: Date | string | null;
  total: number;
  status: string;
}

export async function loadQuotes(ctx: OrgCtx): Promise<QuoteView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.platConQuote.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      include: { job: { select: { name: true, code: true } } },
    });
    return rows.map((q) => ({
      id: String(q.id),
      refNumber: q.refNumber,
      title: q.title,
      clientName: q.clientName,
      jobCode: q.job?.code ?? "",
      validUntil: q.validUntil,
      total: toNum(q.total),
      status: q.status,
    }));
  }
  const rows = await listOptional(ctx.orgSlug, "QUOTES", { maxRecords: 200 });
  return rows.map((r) => ({
    id: r.id,
    refNumber: str(r["Ref_Number"]),
    title: str(r["Title"]) || "(untitled quote)",
    clientName: str(r["Client_Name"]),
    jobCode: "",
    validUntil: str(r["Valid_Until"]) || null,
    total: num(r["Total"]),
    status: str(r["Status"]) || "draft",
  }));
}

// ── Weekly Reports ─────────────────────────────────────────────────────
export interface ReportView {
  id: string;
  title: string;
  weekEnding: Date | string | null;
  generatedAt: Date | string | null;
  jobCode: string | null;
  isAiGenerated: boolean;
  status: string;
}

export async function loadWeeklyReports(ctx: OrgCtx): Promise<ReportView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.platConWeeklyReport.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { weekEnding: "desc" },
      include: { job: { select: { code: true } } },
    });
    return rows.map((r) => ({
      id: String(r.id),
      title: r.title,
      weekEnding: r.weekEnding,
      generatedAt: r.generatedAt,
      jobCode: r.job?.code ?? null,
      isAiGenerated: r.isAiGenerated,
      status: r.status,
    }));
  }
  const rows = await listOptional(ctx.orgSlug, "WEEKLY_REPORTS", { maxRecords: 200 });
  return rows.map((r) => ({
    id: r.id,
    title: str(r["Title"]),
    weekEnding: str(r["Week_Ending"]) || null,
    generatedAt: null, // no generated-at field in the Airtable table
    jobCode: null,
    isAiGenerated: r["Is_AI_Generated"] === true,
    status: str(r["Status"]) || "draft",
  }));
}
