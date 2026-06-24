import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import type { OrgCtx } from "./types";

export interface ReportDetailView {
  id: string;
  title: string;
  weekEnding: Date | null;
  generatedAt: Date | null;
  content: string;
  status: string;
  approvedBy: string;
  approvedAt: Date | null;
  sentAt: Date | null;
  jobCode: string;
  jobName: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function dateOrNull(v: unknown): Date | null {
  const raw = str(v);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function firstLink(v: unknown): string | null {
  return Array.isArray(v) && v.length > 0 ? String(v[0]) : null;
}

async function fromPostgres(ctx: OrgCtx, id: string): Promise<ReportDetailView | null> {
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) return null;
  const report = await prisma.platConWeeklyReport.findFirst({
    where: { id: reportId, orgId: ctx.orgId },
    include: { job: { select: { code: true, name: true } } },
  });
  if (!report) return null;
  return {
    id: String(report.id),
    title: report.title,
    weekEnding: report.weekEnding,
    generatedAt: report.generatedAt,
    content: report.content,
    status: report.status,
    approvedBy: report.approvedBy,
    approvedAt: report.approvedAt,
    sentAt: report.sentAt,
    jobCode: report.job?.code ?? "",
    jobName: report.job?.name ?? "",
  };
}

async function fromAirtable(ctx: OrgCtx, id: string): Promise<ReportDetailView | null> {
  if (!id.startsWith("rec")) return null;
  const report = await core.get(ctx.orgSlug, "WEEKLY_REPORTS", id).catch(() => null);
  if (!report) return null;
  const jobId = firstLink(report["Job"]);
  const job = jobId ? await core.get(ctx.orgSlug, "JOBS", jobId).catch(() => null) : null;
  return {
    id: report.id,
    title: str(report["Title"]),
    weekEnding: dateOrNull(report["Week_Ending"]),
    generatedAt: dateOrNull(report["Generated_At"]),
    content: str(report["Content"]),
    status: str(report["Status"]) || "draft",
    approvedBy: str(report["Approved_By"]),
    approvedAt: dateOrNull(report["Approved_At"]),
    sentAt: dateOrNull(report["Sent_At"]),
    jobCode: "",
    jobName: job ? str(job["Job_Name"]) : "",
  };
}

export function loadReportDetail(ctx: OrgCtx, id: string): Promise<ReportDetailView | null> {
  return airtableEnabled() ? fromAirtable(ctx, id) : fromPostgres(ctx, id);
}
