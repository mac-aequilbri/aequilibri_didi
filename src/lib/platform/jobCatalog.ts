// Construction job-category catalog — curated industry reference data used by
// the Assessment Engine. Each category carries the engagement type it usually
// runs as, a scope hint to prime the intake, and an industry-standard phase
// sequence.
//
// How it feeds the assessment: the phase plan is resolved learnings-first —
// prior jobs of the same category/engagement type take priority; this
// catalog is the EXPERT DEFAULT that fills the cold-start gap before an org
// has history; the AI only originates phases when neither exists. Either way
// the AI fits the week durations to the specific job.
//
// Phase sequences are grounded in Australian industry practice and standards:
//   • Residential builds map to the recognised progress-payment stages
//     (Base/Slab → Frame → Lock-up → Fixing → Practical Completion) used in
//     HIA/Master Builders contracts and defined by the QBCC.
//   • Wet areas place waterproofing AFTER screed/sheeting and BEFORE tiling,
//     per AS 3740 (internal) / AS 4654 (external), with a flood test.
//   • Solar/battery follow the CEC-accredited workflow with DNSP grid
//     approval gates (AS/NZS 5033 PV, AS/NZS 5139 battery).
//   • Electrical/plumbing/HVAC follow rough-in → fit-off → test → certify
//     (AS/NZS 3000 wiring, AS/NZS 3500 plumbing, ARCtick for refrigerant).
//   • Pools include the mandatory safety-barrier certificate before fill
//     (AS 1926.1); demolition surveys/removes asbestos before structural work
//     (WHS). Slabs/footings to AS 2870; concrete to AS 3600.

export type EngagementType = "short_job" | "long_project" | "ongoing" | "seasonal";

export interface JobCategory {
  key: string;
  label: string;
  group: string;
  engagementType: EngagementType;
  /** Pre-fills the scope field when the category is chosen (editable). */
  scopeHint: string;
  /** Industry-standard phase sequence for this category. */
  phases: string[];
}

export const JOB_CATALOG: JobCategory[] = [
  // ── New build ───────────────────────────────────────────────────────
  {
    key: "new_house",
    label: "New house (detached)",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "New detached dwelling — slab on ground, timber/steel frame, mid-range finishes.",
    // Recognised AU residential progress-payment stages (HIA/MBA/QBCC).
    phases: [
      "Pre-construction & approvals",
      "Base / slab (footings, under-slab services, slab pour)",
      "Frame (wall frames, roof trusses, tie-downs)",
      "Lock-up (roof, external cladding, windows, doors)",
      "Fixing & fit-out (linings, cabinetry, wet-area tiling)",
      "Practical completion & handover",
    ],
  },
  {
    key: "multi_dwelling",
    label: "Duplex / townhouses",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "Two or more attached dwellings on one site.",
    phases: [
      "Pre-construction & approvals",
      "Site preparation & earthworks",
      "Base / slab",
      "Frame",
      "Lock-up (enclosed)",
      "Fixing & fit-out",
      "Practical completion & per-dwelling handover",
    ],
  },
  {
    key: "apartment",
    label: "Apartment / multi-residential building",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "Multi-storey residential building.",
    phases: [
      "Pre-construction & DA approval",
      "Site preparation & bulk excavation",
      "Substructure & basement",
      "Superstructure (level-by-level)",
      "Façade & external envelope",
      "Services rough-in & fit-out",
      "Commissioning & essential-services certification",
      "Defects & occupation certificate",
    ],
  },
  {
    key: "commercial_fitout",
    label: "Commercial fit-out (new)",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "Tenancy fit-out — office, retail or hospitality.",
    phases: [
      "Design & documentation",
      "Approvals & landlord consent",
      "Demolition / strip-out",
      "Services rough-in (mechanical, electrical, hydraulic, fire, data)",
      "Partitions & ceilings",
      "Finishes",
      "FF&E & joinery",
      "Commissioning",
      "Defects & handover",
    ],
  },
  {
    key: "granny_flat",
    label: "Granny flat / secondary dwelling",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "Self-contained secondary dwelling.",
    phases: [
      "Approvals & site preparation",
      "Base / slab",
      "Frame",
      "Lock-up",
      "Fixing & fit-out",
      "Completion & occupation certificate",
    ],
  },
  {
    key: "shed_garage",
    label: "Shed / garage / outbuilding",
    group: "New build",
    engagementType: "short_job",
    scopeHint: "Detached shed, garage or carport (Class 10a).",
    phases: [
      "Approval & site set-out",
      "Footings & slab",
      "Frame erection",
      "Frame inspection",
      "Roof & cladding",
      "Finishing trades (gutters, doors, fit-off)",
    ],
  },
  {
    key: "deck_pergola",
    label: "Deck / pergola / patio",
    group: "New build",
    engagementType: "short_job",
    scopeHint: "Outdoor deck, pergola or patio structure.",
    phases: [
      "Planning & approval",
      "Footings (posts/stumps in concrete)",
      "Posts & frame (bearers, joists)",
      "Decking / roof structure",
      "Balustrades, stairs & finishing",
    ],
  },

  // ── Renovation & extension ──────────────────────────────────────────
  {
    key: "kitchen_reno",
    label: "Kitchen renovation",
    group: "Renovation & extension",
    engagementType: "short_job",
    scopeHint: "Kitchen refurbishment — cabinetry, benchtops, appliances.",
    // Hard dependency chain: cabinets → benchtop template → benchtop → splashback.
    phases: [
      "Design, selections & cabinetry order",
      "Demolition / strip-out",
      "Rough-in (plumbing & electrical)",
      "Plaster & wall prep",
      "Floor tiling",
      "Cabinetry install",
      "Benchtop template & install",
      "Splashback & tiling",
      "Fit-off (appliances, tapware, fixtures)",
    ],
  },
  {
    key: "bathroom_reno",
    label: "Bathroom renovation",
    group: "Renovation & extension",
    engagementType: "short_job",
    scopeHint: "Bathroom refurbishment — waterproofing, tiling, fixtures.",
    // Waterproofing sits after screed/sheeting and strictly before tiling (AS 3740).
    phases: [
      "Design & selections",
      "Demolition / strip-out",
      "Rough-in (plumbing & electrical)",
      "Wall sheeting & floor screed (falls)",
      "Waterproofing membrane & certificate (AS 3740)",
      "Wall & floor tiling",
      "Fit-off (vanity, toilet, tapware, screen)",
      "Final clean & inspection",
    ],
  },
  {
    key: "whole_house_reno",
    label: "Whole-house renovation",
    group: "Renovation & extension",
    engagementType: "long_project",
    scopeHint: "Full internal renovation of an existing dwelling.",
    phases: [
      "Design, approvals & strip-out",
      "Structural works",
      "Rough-in services & inspection",
      "Insulation",
      "Lock-up (cladding, windows, doors)",
      "Fixing (plaster, joinery, internal doors)",
      "Wet areas (waterproofing & tiling)",
      "Fit-off, paint & handover",
    ],
  },
  {
    key: "extension",
    label: "Extension / addition",
    group: "Renovation & extension",
    engagementType: "long_project",
    scopeHint: "Ground-floor extension or addition tied into the existing structure.",
    phases: [
      "Design, engineering & approvals",
      "Site preparation & set-out",
      "Footings & slab (tie-in to existing, AS 2870)",
      "Frame & roof",
      "Roof & external cladding",
      "Lock-up (windows & doors)",
      "Rough-in services & insulation",
      "Fixing & break-through to existing",
      "Fit-off, finishes & handover",
    ],
  },
  {
    key: "second_storey",
    label: "Second-storey addition",
    group: "Renovation & extension",
    engagementType: "long_project",
    scopeHint: "Adding a storey over an existing dwelling.",
    phases: [
      "Structural assessment, design & approvals",
      "Site prep, scaffold & strengthening",
      "Propping & roof removal (temporary weatherproofing)",
      "New floor structure",
      "Wall & roof framing",
      "External cladding & roofing (lock-up)",
      "Rough-in, insulation & linings",
      "Wet areas, staircase & fit-off",
      "Final inspections & handover",
    ],
  },
  {
    key: "garage_conversion",
    label: "Garage / room conversion",
    group: "Renovation & extension",
    engagementType: "short_job",
    scopeHint: "Convert an existing space into habitable rooms.",
    // Driven by NCC habitability (2.4 m ceiling, 10% glazing, insulation); Class 1a.
    phases: [
      "Design, drafting & council approval (Class 1a)",
      "Demolition / strip-out & door removal",
      "Structural & compliance works (ceiling, glazing, wall)",
      "Rough-in (plumbing & electrical)",
      "Insulation & thermal upgrade",
      "Floor preparation & finish",
      "Lining, plaster & fixing",
      "Fit-off, finishes & occupancy sign-off",
    ],
  },

  // ── Energy & services ───────────────────────────────────────────────
  {
    key: "solar_pv",
    label: "Solar PV installation",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Rooftop solar photovoltaic system — panels, inverter, grid connection.",
    // CEC-accredited workflow; DNSP pre-approval before install, energisation after.
    phases: [
      "Site assessment & system design (AS/NZS 5033)",
      "Approvals & DNSP pre-approval",
      "Mounting & panel installation",
      "Inverter & DC/AC electrical",
      "Inspection & commissioning",
      "Metering & grid connection",
      "STC paperwork & claim",
    ],
  },
  {
    key: "battery_storage",
    label: "Battery storage installation",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Home/commercial battery energy storage system.",
    phases: [
      "Site assessment & system design (AS/NZS 5139)",
      "Approvals & DNSP notification",
      "Mounting & installation",
      "Electrical integration",
      "Commissioning & testing",
      "Grid sign-off & rebate claim",
    ],
  },
  {
    key: "hvac_install",
    label: "Air-conditioning / HVAC installation",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Split-system, ducted or VRF air-conditioning install.",
    phases: [
      "Heat-load assessment & sizing",
      "Design & zone layout",
      "First fix — mounting & ductwork",
      "Electrical & refrigerant",
      "Vacuum, charge & commissioning (ARCtick)",
      "Handover & controller setup",
    ],
  },
  {
    key: "hot_water",
    label: "Hot water system replacement",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Replace or upgrade a hot water unit (gas, electric, heat pump or solar).",
    phases: [
      "Assessment & selection",
      "Isolation & removal of old unit",
      "Site preparation",
      "Positioning & plumbing connection (tempering valve)",
      "Energy connection (gas / electric / solar)",
      "Commissioning & compliance certificate",
    ],
  },
  {
    key: "electrical_rewire",
    label: "Electrical rewire / switchboard upgrade",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Rewire and/or switchboard and meter upgrade.",
    phases: [
      "Assessment & design (AS/NZS 3000)",
      "Isolation & make-safe",
      "Rough-in (cabling & conduits)",
      "Switchboard & fit-off (RCDs / MCBs)",
      "Testing & verification",
      "Certificate of Compliance & reconnection",
    ],
  },
  {
    key: "replumb",
    label: "Re-pipe / plumbing reroute",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Replace or reroute water/waste pipework.",
    phases: [
      "Assessment & design (AS/NZS 3500)",
      "Isolation & make-safe",
      "Rough-in pipework",
      "Fit-off & connection",
      "Pressure test & inspection",
      "Commissioning & compliance certificate",
    ],
  },

  // ── Roofing & exterior ──────────────────────────────────────────────
  {
    key: "reroof",
    label: "Roof replacement / re-roof",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Strip and replace an existing roof (tile or metal).",
    phases: [
      "Inspection & measure",
      "Strip existing roof",
      "Structure repair & battens",
      "Sarking & insulation",
      "Install roofing (tiles / sheets)",
      "Flashings, cappings, gutters & downpipes",
      "Clean-up & final inspection",
    ],
  },
  {
    key: "roof_repair",
    label: "Roof repair / leak",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Localised roof repair or leak rectification.",
    phases: [
      "Inspection & leak diagnosis",
      "Access set-up (safety / scaffold)",
      "Repair & reseal",
      "Cure",
      "Water / hose test & verify",
    ],
  },
  {
    key: "recladding",
    label: "Re-cladding / façade",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Replace external wall cladding or façade.",
    // AU combustible-cladding context — non-combustible replacement per NCC.
    phases: [
      "Façade assessment & fire-engineering design",
      "Scaffold & access",
      "Strip existing cladding",
      "Wall wrap / sarking & junction prep",
      "Install non-combustible cladding (NCC)",
      "Flashings, penetrations & sealing",
      "Inspection & scaffold strike",
    ],
  },
  {
    key: "guttering",
    label: "Gutter & downpipe replacement",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Replace gutters, fascia and downpipes.",
    phases: [
      "Measure & mark fall line",
      "Remove old gutters (replace fascia if needed)",
      "Fit brackets to fall",
      "Install gutters & downpipes",
      "Seal joints & test flow",
    ],
  },
  {
    key: "painting",
    label: "Painting (interior / exterior)",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Repaint interior and/or exterior surfaces.",
    // Prep-first discipline, to AS 2311.
    phases: [
      "Surface prep (clean, scrape, sand)",
      "Repairs, filling & caulking",
      "Prime / undercoat",
      "First top coat",
      "Second top coat",
      "Inspect & touch-up",
    ],
  },
  {
    key: "waterproofing",
    label: "Waterproofing remediation",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Remediate failed waterproofing (balcony, wet area, basement).",
    // 24-hr flood test before re-tiling is the compliance gate (AS 3740 / AS 4654).
    phases: [
      "Strip finishes & expose substrate",
      "Substrate repair & establish falls",
      "Prime",
      "Apply membrane (multi-coat, AS 4654 / 3740)",
      "Cure",
      "24-hr flood test & record",
      "Re-tile / reinstate",
    ],
  },

  // ── Outdoor & civil ─────────────────────────────────────────────────
  {
    key: "fencing",
    label: "Fencing & gates",
    group: "Outdoor & civil",
    engagementType: "short_job",
    scopeHint: "New or replacement fencing and gates.",
    phases: [
      "Set out & mark posts",
      "Dig post holes",
      "Set posts in concrete (cure)",
      "Install rails & plinth",
      "Fix palings / infill",
      "Hang gate & hardware",
      "Final check",
    ],
  },
  {
    key: "driveway_paving",
    label: "Driveway / paving / concreting",
    group: "Outdoor & civil",
    engagementType: "short_job",
    scopeHint: "Concrete or paved driveway, path or slab.",
    phases: [
      "Excavate to subgrade",
      "Base prep (crushed rock & compaction)",
      "Formwork",
      "Reinforcement (mesh / rebar)",
      "Pour, screed & finish (control joints)",
      "Cure (~7 days)",
      "Seal",
    ],
  },
  {
    key: "landscaping",
    label: "Landscaping",
    group: "Outdoor & civil",
    engagementType: "short_job",
    scopeHint: "Soft and hard landscaping works.",
    // Hard-before-soft so planting isn't damaged by finishing works.
    phases: [
      "Design & site clearance",
      "Earthworks, grading & drainage",
      "Irrigation rough-in",
      "Hardscaping (paving, paths, structures)",
      "Softscaping (soil, planting, turf)",
      "Mulch, finish & maintenance handover",
    ],
  },
  {
    key: "pool",
    label: "Pool installation",
    group: "Outdoor & civil",
    engagementType: "long_project",
    scopeHint: "In-ground concrete or fibreglass swimming pool.",
    // Safety barrier must be installed & certified before fill / handover (AS 1926.1).
    phases: [
      "Design, approval & set-out",
      "Excavation",
      "Shell (steel & shotcrete / fibreglass craned-in)",
      "Plumbing & equipment",
      "Coping, tiling & interior finish",
      "Backfill",
      "Pool barrier & compliance certificate (AS 1926.1)",
      "Fill, commission & handover",
    ],
  },
  {
    key: "retaining_wall",
    label: "Retaining wall",
    group: "Outdoor & civil",
    engagementType: "short_job",
    scopeHint: "Engineered retaining wall.",
    // Drainage behind the wall is the critical engineered element.
    phases: [
      "Engineering design & set-out",
      "Excavate & prepare base",
      "Footings (cure)",
      "Build wall",
      "Drainage behind wall (agi-pipe & gravel)",
      "Layered backfill & compaction",
      "Finish & inspect",
    ],
  },
  {
    key: "demolition",
    label: "Demolition",
    group: "Outdoor & civil",
    engagementType: "short_job",
    scopeHint: "Full or partial demolition and site clearance.",
    // Asbestos surveyed & licensed-removed before structural demolition (WHS).
    phases: [
      "Permits & WHS notification",
      "Service disconnections",
      "Hazmat / asbestos survey & licensed removal",
      "Site set-up (hoarding, fencing)",
      "Soft strip",
      "Structural demolition",
      "Waste removal & site clearance",
    ],
  },

  // ── Maintenance & repair ────────────────────────────────────────────
  {
    key: "general_maintenance",
    label: "General maintenance / handyman",
    group: "Maintenance & repair",
    engagementType: "short_job",
    scopeHint: "General repairs and maintenance works.",
    phases: ["Inspection & quote", "Scheduling & materials", "Works", "Sign-off"],
  },
  {
    key: "storm_damage",
    label: "Storm / water damage repair",
    group: "Maintenance & repair",
    engagementType: "short_job",
    scopeHint: "Make-safe and repair of storm or water damage (often insurance).",
    phases: [
      "Make-safe & assessment",
      "Insurance scope & approval",
      "Repairs",
      "Restoration & sign-off",
    ],
  },
  {
    key: "termite_remediation",
    label: "Pest / termite remediation",
    group: "Maintenance & repair",
    engagementType: "short_job",
    scopeHint: "Termite treatment and associated structural repairs.",
    phases: [
      "Inspection & report",
      "Treatment plan",
      "Treatment & barrier",
      "Structural repairs",
      "Re-inspection & warranty",
    ],
  },
];

const BY_KEY = new Map(JOB_CATALOG.map((c) => [c.key, c]));

export function getCategory(key: string | null | undefined): JobCategory | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

/** Catalog grouped by `group`, preserving definition order — for <optgroup>. */
export function catalogByGroup(): { group: string; categories: JobCategory[] }[] {
  const groups: { group: string; categories: JobCategory[] }[] = [];
  for (const cat of JOB_CATALOG) {
    let g = groups.find((x) => x.group === cat.group);
    if (!g) {
      g = { group: cat.group, categories: [] };
      groups.push(g);
    }
    g.categories.push(cat);
  }
  return groups;
}
