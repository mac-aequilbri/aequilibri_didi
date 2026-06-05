// Port City Roofing pricing — TypeScript port of uc1_roofing/pricing_port_city.py.
// Replicated from their Estimating Calculation worksheets and validated against
// the same 5 historical quotes the Python test suite uses (see pricing.test.ts).
//
// Formula (per quote):
//   internal = Σ (item_qty × item_rate)
//   quoted   = internal × (1 + markup)
//   gst      = grand_total × 0.10
//   total    = grand_total + gst
// Gutters are a SEPARATE roll-up added to the quoted price.

import { GST_RATE, round2, roundTo } from "@/lib/money";

// ── Constant rate table (08.01.2026 sheet revision) ───────────────────────────
export const ROOF_RATE_PER_M2: Record<string, number> = {
  gable: 120.0,
  hip: 130.0,
  ultra: 140.0,
  ultra_gable: 140.0,
  ultra_hip: 155.0,
};

const EDGE_PROTECTION_PER_LM = 19.0;
const FUSE_PULL_FLAT = 500.0;
const CRANE_PER_HR = 500.0;
const BINS_PER_200M2 = 1600.0;
const FASCIA_COVER_PER_LM = 65.0;

const CURVE_QUALITY_PER_M2 = 35.0;
const CURVING_SHEET_RATE = 30.0;

const TILE_REPLACE_PER_M2 = 140.0;
const BATTEN_REPLACE_PER_LM = 16.5;

const ASBESTOS_STARTING_AT = 252.0;
const ASBESTOS_HIGHSET_ALLOW = 1485.0;
const DECROMASTIC_PER_M2 = 110.0;

const SOLAR_HIGHSET_ALLOW = 250.0;
const SOLAR_PANEL_RR = 126.0;
const SOLAR_PANEL_REMOVE = 123.0;
const SOLAR_HW_RR = 1800.0;
const SOLAR_HW_REMOVE = 1000.0;
const SOLAR_TUBE_RR = 2000.0;
const SKYLIGHT_RR = 800.0;

const GUTTER_PER_LM = 100.0;
const DOWNPIPE_90MM = 250.0;
const DOWNPIPE_100MM = 350.0;

export const TRAVEL_RATES: Record<string, number> = {
  ayr_ingham: 600.0,
  charters: 700.0,
  cairns_mackay: 2000.0,
  magnetic_island: 0,
};

export const DEFAULT_MARKUP = 0.1;

// ── Travel zone detection ─────────────────────────────────────────────────────
// suburb/postcode → [zone_key, default_days]
const TRAVEL_ZONES: Record<string, [string, number]> = {
  townsville: ["local", 0],
  garbutt: ["local", 0],
  kelso: ["local", 0],
  kirwan: ["local", 0],
  annandale: ["local", 0],
  mt_louisa: ["local", 0],
  mountlouisa: ["local", 0],
  oonoonba: ["local", 0],
  douglas: ["local", 0],
  west_end: ["local", 0],
  westend: ["local", 0],
  belgian_gardens: ["local", 0],
  belgiangardens: ["local", 0],
  mysterton: ["local", 0],
  rangewood: ["local", 0],
  magnetic_island: ["magnetic_island", 0],
  magneticisland: ["magnetic_island", 0],
  ayr: ["ayr_ingham", 3],
  home_hill: ["ayr_ingham", 3],
  homehill: ["ayr_ingham", 3],
  ingham: ["ayr_ingham", 3],
  rita_island: ["ayr_ingham", 3],
  ritaisland: ["ayr_ingham", 3],
  brandon: ["ayr_ingham", 3],
  giru: ["ayr_ingham", 3],
  toomulla: ["ayr_ingham", 1],
  paluma: ["charters", 1],
  rollingstone: ["ayr_ingham", 1],
  crystal_creek: ["ayr_ingham", 1],
  crystalcreek: ["ayr_ingham", 1],
  charters_towers: ["charters", 2],
  charterstowers: ["charters", 2],
  cairns: ["cairns_mackay", 5],
  mackay: ["cairns_mackay", 5],
};

const POSTCODE_ZONES: Record<string, [string, number]> = {
  "4807": ["ayr_ingham", 3],
  "4806": ["ayr_ingham", 3],
  "4808": ["ayr_ingham", 3],
  "4850": ["ayr_ingham", 3],
  "4816": ["charters", 1],
  "4820": ["charters", 2],
  "4810": ["local", 0],
  "4811": ["local", 0],
  "4812": ["local", 0],
  "4813": ["local", 0],
  "4814": ["local", 0],
  "4815": ["local", 0],
  "4817": ["local", 0],
  "4818": ["local", 0],
};

function normalize(text: string | null | undefined): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function firstPostcode(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(/\b(\d{4})\b/);
  return m ? m[1] : null;
}

/** Return [zoneKey, days, dailyRate] for the given address. */
export function detectTravelZone(
  address = "",
  suburb = "",
  postcode = "",
): [string, number, number] {
  const keySuburb = normalize(suburb);
  if (keySuburb && keySuburb in TRAVEL_ZONES) {
    const [zone, days] = TRAVEL_ZONES[keySuburb];
    return [zone, days, TRAVEL_RATES[zone] ?? 0];
  }

  const pc = firstPostcode(postcode);
  if (pc && pc in POSTCODE_ZONES) {
    const [zone, days] = POSTCODE_ZONES[pc];
    return [zone, days, TRAVEL_RATES[zone] ?? 0];
  }

  const addressNorm = normalize(address);
  for (const [sub, [zone, days]] of Object.entries(TRAVEL_ZONES)) {
    if (sub && addressNorm.includes(sub)) {
      return [zone, days, TRAVEL_RATES[zone] ?? 0];
    }
  }

  const pc2 = firstPostcode(address);
  if (pc2 && pc2 in POSTCODE_ZONES) {
    const [zone, days] = POSTCODE_ZONES[pc2];
    return [zone, days, TRAVEL_RATES[zone] ?? 0];
  }

  return ["local", 0, 0];
}

// ── Quote model ───────────────────────────────────────────────────────────────
export interface LineItemData {
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export class LineItem {
  constructor(
    public description: string,
    public quantity: number,
    public unit: string,
    public rate: number,
  ) {}

  get amount(): number {
    return round2(this.quantity * this.rate);
  }

  toData(): LineItemData {
    return {
      description: this.description,
      quantity: this.quantity,
      unit: this.unit,
      rate: this.rate,
      amount: this.amount,
    };
  }
}

export class PortCityQuote {
  items: LineItem[] = [];
  gutterItems: LineItem[] = [];
  markupPct: number;

  constructor(markupPct: number = DEFAULT_MARKUP) {
    this.markupPct = markupPct;
  }

  add(
    desc: string,
    qty: number,
    unit: string,
    rate: number,
    opts: { gutter?: boolean } = {},
  ): void {
    if (qty <= 0 || rate <= 0) return;
    const item = new LineItem(desc, roundTo(qty, 2), unit, rate);
    (opts.gutter ? this.gutterItems : this.items).push(item);
  }

  get internalSubtotal(): number {
    return round2(this.items.reduce((s, i) => s + i.amount, 0));
  }

  get gutterSubtotal(): number {
    return round2(this.gutterItems.reduce((s, i) => s + i.amount, 0));
  }

  get quotedExGst(): number {
    return round2(this.internalSubtotal * (1 + this.markupPct));
  }

  get grandTotalExGst(): number {
    return round2(this.quotedExGst + this.gutterSubtotal);
  }

  get gst(): number {
    return round2(this.grandTotalExGst * GST_RATE);
  }

  get totalIncGst(): number {
    return round2(this.grandTotalExGst + this.gst);
  }

  toDict() {
    return {
      items: this.items.map((i) => i.toData()),
      gutter_items: this.gutterItems.map((i) => i.toData()),
      internal_subtotal: this.internalSubtotal,
      markup_pct: this.markupPct,
      quoted_ex_gst: this.quotedExGst,
      gutter_subtotal: this.gutterSubtotal,
      grand_total_ex_gst: this.grandTotalExGst,
      gst: this.gst,
      total_inc_gst: this.totalIncGst,
    };
  }
}

export interface QuoteInputs {
  roofType?: string;
  roofAreaM2?: number;
  eaveLm?: number;
  perimeterM?: number;
  includeGutters?: boolean;
  gutterLm?: number;
  downpipe90mm?: number;
  downpipe100mm?: number;
  gutterTravelDays?: number;
  includeFascia?: boolean;
  tileReplaceM2?: number;
  battenReplaceLm?: number;
  isAsbestos?: boolean;
  isDecromastic?: boolean;
  isHighset?: boolean;
  solarPanelsRr?: number;
  solarPanelsRemove?: number;
  solarHwRr?: boolean;
  solarHwRemove?: boolean;
  solarTubeRr?: boolean;
  skylightCount?: number;
  includeFusePull?: boolean;
  includeBins?: boolean;
  craneHours?: number;
  boxGutterLump?: number;
  bullnoseM2?: number;
  bullnoseSheets?: number;
  address?: string;
  suburb?: string;
  postcode?: string;
  travelDaysOverride?: number | null;
  markupPct?: number;
}

const TYPE_LABELS: Record<string, string> = {
  gable: "Gable",
  hip: "Hip",
  ultra: "Ultra",
  ultra_gable: "Ultra-Gable",
  ultra_hip: "Ultra-Hip",
};

function titleZone(zone: string): string {
  return zone
    .replace(/_/g, "/")
    .split("/")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("/");
}

/** Build a PortCityQuote line-by-line from the inputs. */
export function buildPortCityQuote(inp: QuoteInputs = {}): PortCityQuote {
  const {
    roofType = "hip",
    roofAreaM2 = 0,
    eaveLm = 0,
    includeGutters = false,
    gutterLm = 0,
    downpipe90mm = 0,
    downpipe100mm = 0,
    gutterTravelDays = 0,
    includeFascia = false,
    tileReplaceM2 = 0,
    battenReplaceLm = 0,
    isAsbestos = false,
    isDecromastic = false,
    isHighset = false,
    solarPanelsRr = 0,
    solarPanelsRemove = 0,
    solarHwRr = false,
    solarHwRemove = false,
    solarTubeRr = false,
    skylightCount = 0,
    includeFusePull = false,
    includeBins = false,
    craneHours = 0,
    boxGutterLump = 0,
    bullnoseM2 = 0,
    bullnoseSheets = 0,
    address = "",
    suburb = "",
    postcode = "",
    travelDaysOverride = null,
    markupPct = DEFAULT_MARKUP,
  } = inp;

  const q = new PortCityQuote(markupPct);

  // 1. Fuse pull
  if (includeFusePull) {
    q.add("Fuse Pull (Ergon disconnect/reconnect)", 1, "ea", FUSE_PULL_FLAT);
  }

  // 2. Edge protection
  if (eaveLm > 0) {
    q.add("Edge Protection — safety rail", eaveLm, "lm", EDGE_PROTECTION_PER_LM);
  }

  // 3. Main roof
  const roofRate = ROOF_RATE_PER_M2[String(roofType).toLowerCase()] ?? ROOF_RATE_PER_M2.hip;
  if (roofAreaM2 > 0) {
    const label = TYPE_LABELS[String(roofType).toLowerCase()] ?? "Hip";
    q.add(`Colorbond Roof Replacement — ${label}`, roofAreaM2, "m²", roofRate);
  }

  // 4. Asbestos / Decromastic
  if (isAsbestos) {
    q.add("Asbestos Removal — Starting At", 1, "lot", ASBESTOS_STARTING_AT);
    if (isHighset) {
      q.add("Asbestos — Highset Allowance", 1, "lot", ASBESTOS_HIGHSET_ALLOW);
    }
  }
  if (isDecromastic && roofAreaM2 > 0) {
    q.add("Decromastic Tile Removal", roofAreaM2, "m²", DECROMASTIC_PER_M2);
  }

  // 5. Tile / batten
  if (tileReplaceM2 > 0) q.add("Tile Replacement", tileReplaceM2, "m²", TILE_REPLACE_PER_M2);
  if (battenReplaceLm > 0) q.add("Batten Replacement", battenReplaceLm, "lm", BATTEN_REPLACE_PER_LM);

  // 6. Bullnose / curving
  if (bullnoseM2 > 0) q.add("Bullnose — .6 Curve Quality", bullnoseM2, "m²", CURVE_QUALITY_PER_M2);
  if (bullnoseSheets > 0) q.add("Curving Sheet labour", bullnoseSheets, "sheet", CURVING_SHEET_RATE);

  // 7. Bins
  if (includeBins && roofAreaM2 > 0) {
    const binCount = Math.max(1, Math.ceil(roofAreaM2 / 200));
    q.add(`Skip Bins (${binCount} × 200 m² capacity)`, binCount, "ea", BINS_PER_200M2);
  }

  // 7b. Box gutters
  if (boxGutterLump > 0) q.add("Box Gutters", 1, "lot", boxGutterLump);

  // 8. Crane
  if (craneHours > 0) q.add("Crane hire", craneHours, "hr", CRANE_PER_HR);

  // 9. Solar
  if (solarPanelsRr > 0) {
    q.add("Solar Panel — Remove & Replace", solarPanelsRr, "ea", SOLAR_PANEL_RR);
    if (isHighset) q.add("Solar — Highset Allowance", 1, "lot", SOLAR_HIGHSET_ALLOW);
  }
  if (solarPanelsRemove > 0) {
    q.add("Solar Panel — Remove Only", solarPanelsRemove, "ea", SOLAR_PANEL_REMOVE);
  }
  if (solarHwRr) q.add("Solar Hot Water — Remove & Replace", 1, "lot", SOLAR_HW_RR);
  if (solarHwRemove) q.add("Solar Hot Water — Remove Only", 1, "lot", SOLAR_HW_REMOVE);
  if (solarTubeRr) q.add("Solar Tube System — Remove & Replace", 1, "lot", SOLAR_TUBE_RR);
  if (skylightCount > 0) q.add("Skylight — Remove & Replace", skylightCount, "ea", SKYLIGHT_RR);

  // 10. Travel
  const [zone, daysDefault, dailyRate] = detectTravelZone(address, suburb, postcode);
  const days = travelDaysOverride !== null && travelDaysOverride !== undefined ? travelDaysOverride : daysDefault;
  if (days && dailyRate > 0) {
    q.add(`Travel — ${titleZone(zone)}`, days, "day", dailyRate);
  }

  // 11. Fascia covers
  if (includeFascia && eaveLm > 0) q.add("Fascia Covers", eaveLm, "lm", FASCIA_COVER_PER_LM);

  // ── Gutter sub-quote ──
  if (includeGutters && gutterLm > 0) {
    q.add("Guttering — Colorbond 150 mm quad", gutterLm, "lm", GUTTER_PER_LM, { gutter: true });
    if (downpipe90mm > 0) q.add("Downpipes — 90 mm PVC", downpipe90mm, "ea", DOWNPIPE_90MM, { gutter: true });
    if (downpipe100mm > 0) q.add("Downpipes — 100 mm PVC", downpipe100mm, "ea", DOWNPIPE_100MM, { gutter: true });
    if (gutterTravelDays > 0 && dailyRate > 0) {
      q.add(`Gutter Travel — ${titleZone(zone)}`, gutterTravelDays, "day", dailyRate, { gutter: true });
    }
  }

  return q;
}

// ── Tapered $/m² bands ──────────────────────────────────────────────────────
const TAPERED_BANDS: [number | null, number][] = [
  [100, 145.0],
  [100, 130.0],
  [200, 120.0],
  [null, 115.0],
];

export interface TaperedBand {
  start: number;
  end: number;
  rate: number;
  m2: number;
  amount: number;
}

export function taperedRoofBreakdown(roofAreaM2: number): TaperedBand[] {
  const bands: TaperedBand[] = [];
  if (roofAreaM2 <= 0) return bands;
  let remaining = roofAreaM2;
  let running = 0;
  for (const [bandSize, rate] of TAPERED_BANDS) {
    if (remaining <= 0) break;
    const m2InBand = bandSize === null ? remaining : Math.min(bandSize, remaining);
    const start = running;
    const end = running + m2InBand;
    bands.push({
      start: roundTo(start, 1),
      end: roundTo(end, 1),
      rate: round2(rate),
      m2: roundTo(m2InBand, 1),
      amount: round2(m2InBand * rate),
    });
    running += m2InBand;
    remaining -= m2InBand;
  }
  return bands;
}

export function buildTaperedQuote(inp: QuoteInputs = {}): PortCityQuote {
  const roofAreaM2 = Number(inp.roofAreaM2 ?? 0) || 0;
  // Tapered uses 0 markup (bands include margin); suppress the standard roof line.
  const q = buildPortCityQuote({ ...inp, roofAreaM2: 0, markupPct: inp.markupPct ?? 0 });

  const bandItems = taperedRoofBreakdown(roofAreaM2).map(
    (b) =>
      new LineItem(
        `Colorbond Roof — m² ${Math.trunc(b.start) + 1}–${b.end} @ $${b.rate}/m²`,
        b.m2,
        "m²",
        b.rate,
      ),
  );
  q.items = [...bandItems, ...q.items];
  return q;
}

// ── Good / Better / Best package tiers ──────────────────────────────────────
export const PACKAGE_TIERS: Record<
  string,
  { name: string; subtitle: string; markup: number; extras: string[] }
> = {
  essential: {
    name: "🥉 Essential",
    subtitle: "Standard re-roof — solid quality, fair price",
    markup: 0.1,
    extras: [],
  },
  shield: {
    name: "🥈 Shield",
    subtitle: "Most popular — upgraded materials & warranty",
    markup: 0.18,
    extras: [
      "Premium colour upgrade included (any standard Colorbond colour)",
      "Aircell R2.0 insulation (upgraded from R1.5 — better thermal performance)",
      "15-year transferable workmanship warranty (extended from 10)",
      'Cyclonic tie-down "Plus" — fixing every rafter instead of every second',
    ],
  },
  summit: {
    name: "🥇 Summit",
    subtitle: "Premium architectural — lifetime confidence",
    markup: 0.3,
    extras: [
      "Architectural Kliplok 700 concealed-fix profile (lower pitch capable)",
      "Aircell R2.5 insulation (highest practical R-value for steel roof)",
      "25-year transferable workmanship warranty",
      "Cyclone N5 wind-load engineering certificate included",
      "Premium fascia covers and high-grade flashings throughout",
    ],
  },
};

export function buildPackageQuote(packageTier = "essential", inp: QuoteInputs = {}): PortCityQuote {
  const tier = PACKAGE_TIERS[packageTier] ?? PACKAGE_TIERS.essential;
  const q = buildPortCityQuote({ ...inp, markupPct: tier.markup });
  for (const extra of tier.extras) {
    q.items.push(new LineItem(`★ ${extra}`, 1, "inc", 0));
  }
  return q;
}

// ── Customer-facing Scope of Works ────────────────────────────────────────────
const STANDARD_SCOPE_OF_WORKS: (string | null)[] = [
  "Remove old roofing iron and associate flashings",
  "Supply and install .48 BMT BlueScope colorbond AS/NZ 2728 Roof sheeting and flashing",
  "Supply and install Aircell insulation to comply with local building codes AS/NZS4859.1:2002",
  null, // slot 4 — dynamic extras
  "Cyclonic upgrades roof structure tie-down upgrades, cyclone rated Roof screws",
  "Workplace Health & Safety compliance Working at Heights Systems",
  "Form 21 Final inspection certificate, QBCC Home Warranty Insurance, Ergon Inspection Safety Advice",
  "Remove and Dispose of all building debris on site",
  "10 Yr workmanship Warranty",
];

export interface ScopeInputs {
  isAsbestos?: boolean;
  isDecromastic?: boolean;
  solarPanelsRr?: number;
  solarPanelsRemove?: number;
  solarHwRr?: boolean;
  solarHwRemove?: boolean;
  skylightCount?: number;
  bullnoseM2?: number;
  includeGutters?: boolean;
}

export function buildScopeOfWorks(inp: ScopeInputs = {}): string[] {
  const {
    isAsbestos = false,
    isDecromastic = false,
    solarPanelsRr = 0,
    solarPanelsRemove = 0,
    solarHwRr = false,
    solarHwRemove = false,
    skylightCount = 0,
    bullnoseM2 = 0,
    includeGutters = false,
  } = inp;

  const scope: string[] = [];

  if (isAsbestos) {
    scope.push(
      "Remove old Asbestos sheeting and associated flashings — Note Additional costs: " +
        "Existing insulation batts $25.00 per m². Blow-in insulation $60.00 per m² if deemed contaminated.",
    );
  } else if (isDecromastic) {
    scope.push(
      "Remove old Decromastic roof tiles and associated flashings (Note: It is the " +
        "responsibility of the homeowner to declare if asbestos is present in the tiles — " +
        "additional costs may apply)",
    );
  } else {
    scope.push(STANDARD_SCOPE_OF_WORKS[0]!);
  }

  scope.push(STANDARD_SCOPE_OF_WORKS[1]!);
  scope.push(STANDARD_SCOPE_OF_WORKS[2]!);

  const extras: string[] = [];
  if (bullnoseM2 > 0) extras.push("Supply & install new bullnose verandah sheeting");
  if (skylightCount > 0) {
    extras.push(`Supply & install ${skylightCount} new Skylight Dome${skylightCount > 1 ? "s" : ""}`);
  }
  if (includeGutters) {
    extras.push(
      "Remove existing guttering and install new Colorbond Gutters " +
        "(White PVC downpipes additional costs $250.00 each)",
    );
  }
  if (extras.length) scope.push(extras.join(". ") + ".");

  scope.push(...(STANDARD_SCOPE_OF_WORKS.slice(4) as string[]));

  let insertAt = scope.length - 5;
  if (solarPanelsRr > 0) {
    scope.splice(
      insertAt,
      0,
      `Remove & Reinstate ${solarPanelsRr} Solar Panel${solarPanelsRr > 1 ? "s" : ""} — ` +
        "System to be tested before removal (any faults found will be additional works required by Owner)",
    );
    insertAt += 1;
  }
  if (solarPanelsRemove > 0) {
    scope.splice(
      insertAt,
      0,
      `Remove ${solarPanelsRemove} Solar Panel${solarPanelsRemove > 1 ? "s" : ""} — system not to be reinstated`,
    );
    insertAt += 1;
  }
  if (solarHwRr) {
    scope.splice(insertAt, 0, "Remove & Reinstate Solar Hot Water System");
    insertAt += 1;
  } else if (solarHwRemove) {
    scope.splice(insertAt, 0, "Remove Solar Hot Water System (not to be reinstated)");
  }

  return scope;
}

export function buildJobNotes(inp: { isAsbestos?: boolean; includeGutters?: boolean } = {}): string {
  const { isAsbestos = false, includeGutters = false } = inp;
  const notes: string[] = [];
  if (includeGutters) {
    notes.push("Includes new Colorbond gutters and downpipes as itemised above.");
  } else {
    notes.push(
      "Gutters additional cost — see itemised sub-quote. Downpipes $250.00 each if required.",
    );
  }
  if (isAsbestos) {
    notes.push(
      "Existing insulation batts $25.00 per m². Blow-in insulation $60.00 per m² if deemed contaminated.",
    );
  }
  return notes.join(" ");
}
