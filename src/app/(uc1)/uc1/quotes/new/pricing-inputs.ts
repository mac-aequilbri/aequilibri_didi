// Shared mapping from the quote-options form to the Port City pricing engine.
// Pure module — imported by BOTH the client wizard (live preview) and the
// server action (createQuote), so the price shown matches the price saved.

import {
  buildPortCityQuote,
  buildTaperedQuote,
  buildPackageQuote,
  PACKAGE_TIERS,
  type QuoteInputs,
  type PortCityQuote,
} from "@/services/uc1/pricing";

export interface QuoteOptionFields {
  address: string;
  suburb: string;
  roofType: string; // "gable" | "hip" | "ultra"
  roofAreaM2: number;
  eaveLm: number;
  perimeterM: number;
  storeys: number;
  includeGutters: boolean;
  gutterLm: number;
  downpipe90mm: number;
  isAsbestos: boolean;
  isDecromastic: boolean;
  solarPanelsRr: number;
  solarHwRr: boolean;
  includeFusePull: boolean;
  includeBins: boolean;
  battenReplaceLm: number;
  includeFascia: boolean;
  markupMode: string; // "match" | "optimal" | "premium"
}

const MODE_MARKUP: Record<string, number> = { match: 0.1, optimal: 0.18, premium: 0.25 };

export function buildQuoteInputs(f: QuoteOptionFields): QuoteInputs {
  const highset = f.storeys >= 2;
  return {
    roofType: f.roofType,
    roofAreaM2: f.roofAreaM2,
    eaveLm: f.eaveLm || f.perimeterM,
    perimeterM: f.perimeterM,
    isHighset: highset,
    includeGutters: f.includeGutters,
    gutterLm: f.includeGutters ? f.gutterLm || f.perimeterM * 0.5 : 0,
    downpipe90mm: f.downpipe90mm,
    isAsbestos: f.isAsbestos,
    isDecromastic: f.isDecromastic,
    solarPanelsRr: f.solarPanelsRr,
    solarHwRr: f.solarHwRr,
    includeFusePull: f.includeFusePull,
    includeBins: f.includeBins,
    battenReplaceLm: f.battenReplaceLm,
    includeFascia: f.includeFascia,
    address: f.address,
    suburb: f.suburb,
    markupPct: MODE_MARKUP[f.markupMode] ?? 0.1,
  };
}

export function buildQuoteFromMechanism(mechanism: string, packageTier: string, inputs: QuoteInputs): PortCityQuote {
  if (mechanism === "tapered") return buildTaperedQuote(inputs);
  if (mechanism === "packages") return buildPackageQuote(packageTier in PACKAGE_TIERS ? packageTier : "essential", inputs);
  return buildPortCityQuote(inputs);
}
