"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { callClaude } from "@/lib/claude";
import { materialDisplay } from "@/services/uc1/constants";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

async function generateReportNumber(): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
  for (let i = 0; i < 25; i++) {
    const count = await prisma.uc1RoofConditionReport.count({ where: { reportNumber: { startsWith: `RCR-${ymd}-` } } });
    const rcr = `RCR-${ymd}-${String(count + 1 + i).padStart(4, "0")}`;
    const exists = await prisma.uc1RoofConditionReport.findUnique({ where: { reportNumber: rcr }, select: { id: true } });
    if (!exists) return rcr;
  }
  return `RCR-${ymd}-${Date.now() % 10000}`;
}

const GRADES = new Set(["A", "B", "C", "D", "F"]);
const URGENCY = new Set(["routine", "within_5_years", "within_2_years", "within_1_year", "immediate"]);

/** Generate an AI-assisted roof condition report for a quote.
 *  Mirrors Django uc1_roofing.views.condition_report_create. */
export async function createConditionReport(formData: FormData) {
  const quoteId = Number(formData.get("quote_id"));
  if (!quoteId) redirect("/uc1/condition-reports");

  const quote = await prisma.uc1Quote.findUnique({
    where: { id: quoteId },
    include: { contact: true, lidarAnalysis: true },
  });
  if (!quote) redirect("/uc1/condition-reports");

  const reportType = String(formData.get("report_type") ?? "homebuyer");
  const clientName = String(formData.get("client_name") ?? quote!.contact?.name ?? "");
  const clientEmail = String(formData.get("client_email") ?? quote!.contact?.email ?? "");
  const clientCompany = String(formData.get("client_company") ?? "");
  const inspectorName = String(formData.get("inspector_name") ?? "");
  const priceExGst = Number(formData.get("price_ex_gst")) || 350;
  const extraNotes = String(formData.get("inspector_notes") ?? "");

  const lidar = quote!.lidarAnalysis;
  const lidarBlock = lidar
    ? `
LiDAR Measurements:
  Perimeter: ${Math.round(lidar.perimeterM)} m
  Ridge height: ${lidar.ridgeHeightM ?? "N/A"} m
  Eave height: ${lidar.eaveHeightM ?? "N/A"} m
  Solar panels detected: ${lidar.solarPanels}
  Scaffolding required: ${lidar.scaffoldingRequired} (${lidar.scaffoldingRiskLevel} risk)
  LiDAR coverage: ${lidar.lidarCoverage}`
    : "";

  const contextText = `Property: ${quote!.propertyAddress}
Roof material: ${materialDisplay(quote!.material)}
Roof pitch: ${quote!.pitchType}
Plan area: ${Number(quote!.flatAreaSqm)} m²
${lidarBlock}
Inspector notes: ${extraNotes}
Report type: ${reportType}`;

  const system = `You are a licensed roof inspector in Australia generating a formal Roof Condition Report.
Assess the roof based on the provided data.
Return ONLY valid JSON with these exact keys:
  condition_grade: "A", "B", "C", "D", or "F"
  condition_score: integer 0-100 (100=perfect, 0=failed)
  life_remaining_years: integer
  urgency_level: one of "routine", "within_5_years", "within_2_years", "within_1_year", "immediate"
  assessment: 3 professional paragraphs (narrative condition description)
  recommended_works: numbered list of recommended works in priority order`;

  const result = await callClaude(system, contextText, { maxTokens: 1024 });

  let ai: {
    condition_grade?: string;
    condition_score?: number;
    life_remaining_years?: number;
    urgency_level?: string;
    assessment?: string;
    recommended_works?: string;
  } = {};
  try {
    const m = result.content.match(/\{[\s\S]*\}/);
    if (m) ai = JSON.parse(m[0]);
  } catch {
    ai = {};
  }

  const grade = ai.condition_grade && GRADES.has(ai.condition_grade) ? ai.condition_grade : "B";
  const urgency = ai.urgency_level && URGENCY.has(ai.urgency_level) ? ai.urgency_level : "routine";

  const reportNumber = await generateReportNumber();
  const report = await prisma.uc1RoofConditionReport.create({
    data: {
      quoteId: quote!.id,
      reportNumber,
      reportType,
      clientName,
      clientEmail,
      clientCompany,
      conditionGrade: grade,
      conditionScore: Number(ai.condition_score ?? 70),
      lifeRemainingYears: Number(ai.life_remaining_years ?? 10),
      urgencyLevel: urgency,
      aiAssessment: ai.assessment ?? result.content.slice(0, 2000),
      recommendedWorks: ai.recommended_works ?? "",
      inspectorName,
      priceExGst,
      status: "draft",
    },
  });

  await prisma.uc1ExecutionLog.create({
    data: {
      toolName: "condition_report_generate",
      payload: JSON.stringify({ type: reportType, quote: quote!.refNumber }),
      result: JSON.stringify({ report: report.reportNumber, grade, score: report.conditionScore }),
      status: result.demo_mode ? "demo" : "success",
      quoteId: quote!.id,
    },
  });

  redirect(`/uc1/condition-reports/${report.id}`);
}

export async function finaliseReport(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.uc1RoofConditionReport.update({ where: { id }, data: { status: "final" } });
  revalidatePath(`/uc1/condition-reports/${id}`);
}

export async function deliverReport(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.uc1RoofConditionReport.update({ where: { id }, data: { status: "delivered" } });
  revalidatePath(`/uc1/condition-reports/${id}`);
}

export async function updateReportPrice(formData: FormData) {
  const id = Number(formData.get("id"));
  const price = Number(formData.get("price_ex_gst"));
  if (!id || !Number.isFinite(price)) return;
  await prisma.uc1RoofConditionReport.update({ where: { id }, data: { priceExGst: price } });
  revalidatePath(`/uc1/condition-reports/${id}`);
}
