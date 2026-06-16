"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { buildQuoteInputs, buildQuoteFromMechanism } from "./pricing-inputs";
import { applyRules, recordCorrection } from "@/services/uc1/learning";

// Record a roof-area correction when the estimator overrides the AI measurement
// in the Roof Plan dialog (feeds the learning loop).
export async function recordRoofCorrectionAction(data: { aiArea: number; humanArea: number; address: string; suburb: string }) {
  if (!data.aiArea || Math.abs(data.humanArea - data.aiArea) / data.aiArea < 0.02) return;
  await recordCorrection({
    dimension: "roof_area",
    aiValue: Math.round(data.aiArea * 10) / 10,
    humanValue: Math.round(data.humanArea * 10) / 10,
    address: data.address,
    suburb: data.suburb,
    rootCause: "estimator override in roof plan review",
  });
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

async function generateRefNumber(): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
  for (let i = 0; i < 25; i++) {
    const count = await prisma.uc1Quote.count({ where: { refNumber: { startsWith: `REF-${ymd}-` } } });
    const ref = `REF-${ymd}-${String(count + 1 + i).padStart(4, "0")}`;
    const exists = await prisma.uc1Quote.findUnique({ where: { refNumber: ref }, select: { id: true } });
    if (!exists) return ref;
  }
  return `REF-${ymd}-${Date.now() % 10000}`;
}

export async function createQuote(formData: FormData) {
  const str = (k: string, d = "") => String(formData.get(k) ?? d);
  const num = (k: string, d = 0) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? v : d;
  };
  const on = (k: string) => formData.get(k) === "on" || formData.get(k) === "true";

  const address = str("address").trim();
  if (!address) throw new Error("Property address is required");

  const mechanism = str("pricing_mechanism", "cost_plus");
  const packageTier = str("package_tier", "essential");
  const suburb = str("suburb");

  // Apply validated learning rules (Contextual Intelligence) to this estimate.
  const appliedRules = await applyRules({ address, suburb });
  let roofArea = num("roof_area_m2");
  let extraMarkup = 0;
  for (const r of appliedRules) {
    if (r.adjustment.type === "area_multiplier") roofArea = round2(roofArea * r.adjustment.value);
    else if (r.adjustment.type === "contingency_pct") extraMarkup += r.adjustment.value / 100;
  }
  const ruleNote = appliedRules.length
    ? `Applied learning rules: ${appliedRules.map((r) => r.ruleCode).join(", ")}.`
    : "";

  const inputs = buildQuoteInputs({
    address,
    suburb,
    roofType: str("roof_type", "hip"),
    roofAreaM2: roofArea,
    eaveLm: num("eave_lm"),
    perimeterM: num("perimeter_m"),
    storeys: num("storeys", 1),
    includeGutters: on("inc_gutter"),
    gutterLm: num("gutter_lm"),
    downpipe90mm: num("downpipe_90mm"),
    isAsbestos: on("inc_asbestos"),
    isDecromastic: on("inc_decromastic"),
    solarPanelsRr: on("inc_solar_rr") ? num("solar_panel_count", 10) : 0,
    solarHwRr: on("inc_solar_hw"),
    includeFusePull: on("inc_fuse_pull"),
    includeBins: on("inc_bins"),
    battenReplaceLm: on("inc_batten") ? num("roof_area_m2") * 2 : 0,
    includeFascia: on("inc_fascia"),
    markupMode: str("pricing_mode", "match"),
  });
  inputs.markupPct = (inputs.markupPct ?? 0.1) + extraMarkup;
  const q = buildQuoteFromMechanism(mechanism, packageTier, inputs);

  const ref = await generateRefNumber();
  const clientName = str("client_name").trim();
  let newId = 0;

  await prisma.$transaction(async (tx) => {
    let contactId: number | null = null;
    if (clientName) {
      const contact = await tx.uc1Contact.create({
        data: {
          name: clientName,
          company: str("client_company"),
          email: str("client_email"),
          phone: str("client_phone"),
          address,
        },
      });
      contactId = contact.id;
    }

    const quote = await tx.uc1Quote.create({
      data: {
        refNumber: ref,
        contactId,
        propertyAddress: address,
        flatAreaSqm: num("flat_area_sqm") || num("roof_area_m2"),
        pitchType: str("pitch_type", "standard"),
        material: str("material", "colorbond"),
        wasteFactorPct: num("waste_factor_pct", 10),
        eaveLm: num("eave_lm"),
        perimeterM: num("perimeter_m"),
        storeys: Math.round(num("storeys", 1)),
        roofColour: str("roof_colour"),
        roofPolygonJson: str("roof_polygon_json") || null,
        notes: [str("notes"), ruleNote].filter(Boolean).join("\n"),
        pricingMechanism: mechanism,
        packageTier: mechanism === "packages" ? packageTier : "",
        markupPct: q.markupPct,
        status: "draft",
      },
    });
    newId = quote.id;

    // Non-gutter items carry the markup (customer-facing rate); gutter sub-quote
    // is added at face value after markup — matching the Port City model, so the
    // saved line-item total equals the quoted grand total.
    const markup = 1 + q.markupPct;
    const items = [
      ...q.items.map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit, rate: round2(it.rate * markup) })),
      ...q.gutterItems.map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit, rate: it.rate })),
    ].map((it, idx) => ({
      quoteId: quote.id,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPriceExGst: it.rate,
      sortOrder: idx,
    }));
    if (items.length) await tx.uc1QuoteItem.createMany({ data: items });
  });

  redirect(`/uc1/quotes/${newId}`);
}
