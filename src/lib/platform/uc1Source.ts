// UC1 (Roofing) data sources — Postgres (default) or Airtable when the flag is
// on. UC1 is single-tenant (no org), so a fixed slug resolves to the roofing
// base. First UC1 page on Airtable; the rest of the ~40 Uc1* models follow the
// same pattern. createdAt isn't carried from Airtable (no field) -> null.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";

/** Single-tenant roofing base key (dev resolves to the demo base). */
const UC1_SLUG = "uc1-roofing";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export interface Uc1ContactView {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  createdAt: Date | string | null;
  quotes: number;
}

export async function loadUc1Contacts(): Promise<Uc1ContactView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1Contact.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { quotes: true } } },
    });
    return rows.map((c) => ({
      id: String(c.id),
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.company,
      createdAt: c.createdAt,
      quotes: c._count.quotes,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_CONTACTS", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Contact_Name"]) || "(unnamed)",
    email: str(r["Email"]),
    phone: str(r["Phone"]),
    company: str(r["Company"]),
    createdAt: null, // no created field carried from Airtable
    quotes: 0, // quote linkage not migrated yet
  }));
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

export interface Uc1RateCardView {
  id: string;
  material: string;
  pitchType: string;
  description: string;
  unit: string;
  rateExGst: number;
  isActive: boolean;
}

export async function loadUc1RateCards(): Promise<Uc1RateCardView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1RateCard.findMany({
      orderBy: [{ material: "asc" }, { pitchType: "asc" }],
    });
    return rows.map((c) => ({
      id: String(c.id),
      material: c.material,
      pitchType: c.pitchType,
      description: c.description,
      unit: c.unit,
      rateExGst: Number(c.rateExGst),
      isActive: c.isActive,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_RATE_CARDS", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    material: str(r["Material"]),
    pitchType: str(r["Pitch_Type"]),
    description: str(r["Description"]),
    unit: str(r["Unit"]) || "m²",
    rateExGst: num(r["Rate_Ex_GST"]),
    isActive: r["Is_Active"] === true,
  }));
}

export interface Uc1FinanceProviderView {
  id: string;
  name: string;
  interestRatePct: number;
  minTermMonths: number;
  maxTermMonths: number;
  tagline: string;
  isActive: boolean;
}

export async function loadUc1FinanceProviders(): Promise<Uc1FinanceProviderView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1FinanceProvider.findMany({ orderBy: { name: "asc" } });
    return rows.map((p) => ({
      id: String(p.id),
      name: p.name,
      interestRatePct: Number(p.interestRatePct),
      minTermMonths: p.minTermMonths,
      maxTermMonths: p.maxTermMonths,
      tagline: p.tagline,
      isActive: p.isActive,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_FINANCE_PROVIDERS", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Name"]),
    interestRatePct: num(r["Interest_Rate_Pct"]),
    minTermMonths: num(r["Min_Term_Months"]),
    maxTermMonths: num(r["Max_Term_Months"]),
    tagline: str(r["Tagline"]),
    isActive: r["Is_Active"] === true,
  }));
}

export interface Uc1GutteringRateView {
  id: string;
  itemType: string;
  description: string;
  rateExGst: number;
  unit: string;
  isActive: boolean;
}

export async function loadUc1GutteringRates(): Promise<Uc1GutteringRateView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1GutteringRate.findMany({ orderBy: { itemType: "asc" } });
    return rows.map((c) => ({
      id: String(c.id),
      itemType: c.itemType,
      description: c.description,
      rateExGst: Number(c.rateExGst),
      unit: c.unit,
      isActive: c.isActive,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_GUTTERING_RATES", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    itemType: str(r["Item_Type"]),
    description: str(r["Description"]),
    rateExGst: num(r["Rate_Ex_GST"]),
    unit: str(r["Unit"]) || "lm",
    isActive: r["Is_Active"] === true,
  }));
}

export interface Uc1RegionView {
  id: string;
  name: string;
  postcodes: string;
  travelDays: number;
  travelRate: number;
  premiumPct: number;
  isActive: boolean;
}

export async function loadUc1Regions(): Promise<Uc1RegionView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1Region.findMany({ orderBy: { name: "asc" } });
    return rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      postcodes: r.postcodes,
      travelDays: r.travelDays,
      travelRate: Number(r.travelRate),
      premiumPct: r.premiumPct,
      isActive: r.isActive,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_REGIONS", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Name"]),
    postcodes: str(r["Postcodes"]),
    travelDays: num(r["Travel_Days"]),
    travelRate: num(r["Travel_Rate"]),
    premiumPct: num(r["Premium_Pct"]),
    isActive: r["Is_Active"] === true,
  }));
}

export interface Uc1TeamMemberView {
  id: string;
  name: string;
  role: string;
  accuracyProfile: string;
  dateJoined: Date | string | null;
  isActive: boolean;
  corrections: number;
}

export async function loadUc1Team(): Promise<Uc1TeamMemberView[]> {
  if (!airtableEnabled()) {
    const members = await prisma.uc1TeamMember.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    const counts = await prisma.uc1Correction.groupBy({
      by: ["estimatorId"],
      _count: { id: true },
      where: { estimatorId: { not: null } },
    });
    const byId: Record<number, number> = Object.fromEntries(
      counts.map((c) => [c.estimatorId as number, c._count.id]),
    );
    return members.map((m) => ({
      id: String(m.id),
      name: m.name,
      role: m.role,
      accuracyProfile: m.accuracyProfile,
      dateJoined: m.dateJoined,
      isActive: m.isActive,
      corrections: byId[m.id] ?? 0,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_TEAM", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Name"]),
    role: str(r["Role"]) || "estimator",
    accuracyProfile: str(r["Accuracy_Profile"]),
    dateJoined: str(r["Date_Joined"]) || null,
    isActive: r["Is_Active"] === true,
    corrections: 0,
  }));
}

export interface Uc1SolarPartnerView {
  id: string;
  name: string;
  contactName: string;
  referralFeePct: number;
  avgInstallValue: number;
  isActive: boolean;
}

export async function loadUc1SolarPartners(): Promise<Uc1SolarPartnerView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1SolarPartner.findMany({ orderBy: { name: "asc" } });
    return rows.map((p) => ({
      id: String(p.id),
      name: p.name,
      contactName: p.contactName,
      referralFeePct: Number(p.referralFeePct),
      avgInstallValue: Number(p.avgInstallValue),
      isActive: p.isActive,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_SOLAR_PARTNERS", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Name"]),
    contactName: str(r["Contact_Name"]),
    referralFeePct: num(r["Referral_Fee_Pct"]),
    avgInstallValue: num(r["Avg_Install_Value"]),
    isActive: r["Is_Active"] === true,
  }));
}

export interface Uc1WorkstreamView {
  id: string;
  name: string;
  description: string;
  milestone: string;
  status: string;
  loadAtSessionStart: boolean;
  lastUpdated: Date | string | null;
}

export async function loadUc1Workstreams(): Promise<Uc1WorkstreamView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1Workstream.findMany({
      orderBy: [{ status: "asc" }, { lastUpdated: "desc" }],
    });
    return rows.map((w) => ({
      id: String(w.id),
      name: w.name,
      description: w.description,
      milestone: w.milestone,
      status: w.status,
      loadAtSessionStart: w.loadAtSessionStart,
      lastUpdated: w.lastUpdated,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_WORKSTREAMS", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Name"]),
    description: str(r["Description"]),
    milestone: str(r["Milestone"]),
    status: str(r["Status"]) || "active",
    loadAtSessionStart: r["Load_At_Session_Start"] === true,
    lastUpdated: str(r["Last_Updated"]) || null,
  }));
}

export interface Uc1PriceCheckLogView {
  id: string;
  runAt: Date | string | null;
  status: string;
  vendorsChecked: number;
  pricesUpdated: number;
  pricesUnchanged: number;
  errors: number;
  summary: string;
}

export interface Uc1PriceMovementView {
  id: string;
  description: string;
  unitPriceExGst: number;
  previousPrice: number | null;
  updatedAt: Date | string | null;
  vendor: { name: string };
}

export async function loadUc1PriceCheck(): Promise<{
  logs: Uc1PriceCheckLogView[];
  recentChanges: Uc1PriceMovementView[];
}> {
  if (!airtableEnabled()) {
    const [logRows, priceRows] = await Promise.all([
      prisma.uc1PriceCheckLog.findMany({ orderBy: { runAt: "desc" }, take: 50 }),
      prisma.uc1VendorMaterialPrice.findMany({
        where: { previousPrice: { not: null } },
        include: { vendor: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    ]);
    return {
      logs: logRows.map((l) => ({
        id: String(l.id),
        runAt: l.runAt,
        status: l.status,
        vendorsChecked: l.vendorsChecked,
        pricesUpdated: l.pricesUpdated,
        pricesUnchanged: l.pricesUnchanged,
        errors: l.errors,
        summary: l.summary,
      })),
      recentChanges: priceRows.map((p) => ({
        id: String(p.id),
        description: p.description,
        unitPriceExGst: Number(p.unitPriceExGst),
        previousPrice: p.previousPrice == null ? null : Number(p.previousPrice),
        updatedAt: p.updatedAt,
        vendor: { name: p.vendor.name },
      })),
    };
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_PRICE_CHECK_LOG", { maxRecords: 50 });
  return {
    logs: rows.map((r) => ({
      id: r.id,
      runAt: str(r["Run_At"]) || null,
      status: str(r["Status"]) || "success",
      vendorsChecked: num(r["Vendors_Checked"]),
      pricesUpdated: num(r["Prices_Updated"]),
      pricesUnchanged: num(r["Prices_Unchanged"]),
      errors: num(r["Errors"]),
      summary: str(r["Summary"]),
    })),
    // Vendor price-movement tracking not migrated yet.
    recentChanges: [],
  };
}

export interface Uc1ActionView {
  id: string;
  action: string;
  priority: string;
  dueDate: Date | null;
  triggerCondition: string;
  status: string;
  notes: string;
}

export async function loadUc1Actions(): Promise<Uc1ActionView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1ActionHub.findMany({
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    });
    return rows.map((a) => ({
      id: String(a.id),
      action: a.action,
      priority: a.priority,
      dueDate: a.dueDate,
      triggerCondition: a.triggerCondition,
      status: a.status,
      notes: a.notes,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_ACTION_HUB", { maxRecords: 500 });
  return rows.map((r) => {
    const due = str(r["Due_Date"]);
    return {
      id: r.id,
      action: str(r["Action"]),
      priority: str(r["Priority"]) || "P2",
      dueDate: due ? new Date(due) : null,
      triggerCondition: str(r["Trigger_Condition"]),
      status: str(r["Status"]) || "open",
      notes: str(r["Notes"]),
    };
  });
}

export interface Uc1ExecLogView {
  id: string;
  toolName: string;
  status: string;
  durationMs: number;
  createdAt: Date | string | null;
}

export async function loadUc1ExecLog(): Promise<Uc1ExecLogView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1ExecutionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, toolName: true, status: true, durationMs: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: String(r.id),
      toolName: r.toolName,
      status: r.status,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_EXECUTION_LOG", { maxRecords: 100 });
  return rows.map((r) => ({
    id: r.id,
    toolName: str(r["Tool_Name"]),
    status: str(r["Status"]) || "success",
    durationMs: num(r["Duration_Ms"]),
    createdAt: str(r["Logged_At"]) || null,
  }));
}

export interface Uc1IntelSnapshotView {
  accuracyRatePct: number;
  completedJobs: number;
  avgConfidence: number;
  confidenceTrajectory: string;
  gapsJson: string;
}
export interface Uc1IntelCorrectionView {
  id: string;
  dimension: string;
  suburb: string;
  aiValue: number;
  humanValue: number;
  variancePct: number;
  rootCause: string;
  createdAt: Date | string | null;
}
export interface Uc1IntelHypothesisView {
  id: string;
  description: string;
  sampleCount: number;
  avgVariancePct: number;
  confidence: number;
  status: string;
}
export interface Uc1IntelRuleView {
  id: string;
  ruleCode: string;
  category: string;
  description: string;
  triggerCondition: string;
  priority: number;
  confidence: number;
  timesTriggered: number;
  isActive: boolean;
  autoApply: boolean;
}
export interface Uc1QuoteRow {
  id: string;
  refNumber: string;
  propertyAddress: string;
  status: string;
  createdAt: Date | string | null;
  contactName: string | null;
  total: number;
}

const GST = 1.1;

/** Quotes list with totals. Postgres computes total from line items; Airtable
 *  uses the denormalized Total field. Returns `connected:false` on DB error to
 *  match the page's existing behaviour. */
export async function loadUc1Quotes(
  status: string,
): Promise<{ connected: boolean; rows: Uc1QuoteRow[] }> {
  if (!airtableEnabled()) {
    try {
      const where = status && status !== "all" ? { status } : {};
      const quotes = await prisma.uc1Quote.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { items: true, contact: true },
      });
      return {
        connected: true,
        rows: quotes.map((q) => ({
          id: String(q.id),
          refNumber: q.refNumber,
          propertyAddress: q.propertyAddress,
          status: q.status,
          createdAt: q.createdAt,
          contactName: q.contact?.name ?? null,
          total:
            Math.round(
              q.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPriceExGst), 0) *
                GST *
                100,
            ) / 100,
        })),
      };
    } catch {
      return { connected: false, rows: [] };
    }
  }
  try {
    const all = await core.list(UC1_SLUG, "ROOFING_QUOTES", { maxRecords: 500 });
    const rows = all
      .filter((q) => status === "all" || !status || str(q["Status"]) === status)
      .map((q) => ({
        id: q.id,
        refNumber: str(q["Ref_Number"]),
        propertyAddress: str(q["Property_Address"]),
        status: str(q["Status"]) || "draft",
        createdAt: str(q["Created_At"]) || null,
        contactName: str(q["Contact_Name"]) || null,
        total: num(q["Total"]),
      }));
    return { connected: true, rows };
  } catch {
    return { connected: false, rows: [] };
  }
}

export interface Uc1IntelligenceData {
  snapshot: Uc1IntelSnapshotView | null;
  corrections: Uc1IntelCorrectionView[];
  hypotheses: Uc1IntelHypothesisView[];
  rules: Uc1IntelRuleView[];
}

export async function loadUc1Intelligence(): Promise<Uc1IntelligenceData> {
  if (!airtableEnabled()) {
    const [snap, corrections, hypotheses, rules] = await Promise.all([
      prisma.uc1IntelligenceSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
      prisma.uc1Correction.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.uc1Hypothesis.findMany({ orderBy: { confidence: "desc" } }),
      prisma.uc1LearningRule.findMany({ orderBy: [{ isActive: "desc" }, { confidence: "desc" }] }),
    ]);
    return {
      snapshot: snap
        ? {
            accuracyRatePct: snap.accuracyRatePct,
            completedJobs: snap.completedJobs,
            avgConfidence: snap.avgConfidence,
            confidenceTrajectory: snap.confidenceTrajectory,
            gapsJson: snap.gapsJson,
          }
        : null,
      corrections: corrections.map((c) => ({
        id: String(c.id),
        dimension: c.dimension,
        suburb: c.suburb,
        aiValue: c.aiValue,
        humanValue: c.humanValue,
        variancePct: c.variancePct,
        rootCause: c.rootCause,
        createdAt: c.createdAt,
      })),
      hypotheses: hypotheses.map((h) => ({
        id: String(h.id),
        description: h.description,
        sampleCount: h.sampleCount,
        avgVariancePct: h.avgVariancePct,
        confidence: h.confidence,
        status: h.status,
      })),
      rules: rules.map((r) => ({
        id: String(r.id),
        ruleCode: r.ruleCode,
        category: r.category,
        description: r.description,
        triggerCondition: r.triggerCondition,
        priority: r.priority,
        confidence: r.confidence,
        timesTriggered: r.timesTriggered,
        isActive: r.isActive,
        autoApply: r.autoApply,
      })),
    };
  }
  const [snapRows, corrRows, hypRows, ruleRows] = await Promise.all([
    core.list(UC1_SLUG, "ROOFING_INTELLIGENCE_SNAPSHOT", { maxRecords: 1 }),
    core.list(UC1_SLUG, "ROOFING_CORRECTIONS", { maxRecords: 20 }),
    core.list(UC1_SLUG, "ROOFING_HYPOTHESES", { maxRecords: 200 }),
    core.list(UC1_SLUG, "ROOFING_LEARNING_RULES", { maxRecords: 200 }),
  ]);
  const s = snapRows[0];
  return {
    snapshot: s
      ? {
          accuracyRatePct: num(s["Accuracy_Rate_Pct"]),
          completedJobs: num(s["Completed_Jobs"]),
          avgConfidence: num(s["Avg_Confidence"]),
          confidenceTrajectory: str(s["Confidence_Trajectory"]) || "stable",
          gapsJson: str(s["Gaps_Json"]) || "[]",
        }
      : null,
    corrections: corrRows.map((c) => ({
      id: c.id,
      dimension: str(c["Dimension"]),
      suburb: str(c["Suburb"]),
      aiValue: num(c["AI_Value"]),
      humanValue: num(c["Human_Value"]),
      variancePct: num(c["Variance_Pct"]),
      rootCause: str(c["Root_Cause"]),
      createdAt: str(c["Created_At"]) || null,
    })),
    hypotheses: hypRows.map((h) => ({
      id: h.id,
      description: str(h["Description"]),
      sampleCount: num(h["Sample_Count"]),
      avgVariancePct: num(h["Avg_Variance_Pct"]),
      confidence: num(h["Confidence"]),
      status: str(h["Status"]) || "pending",
    })),
    rules: ruleRows.map((r) => ({
      id: r.id,
      ruleCode: str(r["Rule_Code"]),
      category: str(r["Category"]),
      description: str(r["Description"]),
      triggerCondition: str(r["Trigger_Condition"]),
      priority: num(r["Priority"]),
      confidence: num(r["Confidence"]),
      timesTriggered: num(r["Times_Triggered"]),
      isActive: r["Is_Active"] === true,
      autoApply: r["Auto_Apply"] === true,
    })),
  };
}
