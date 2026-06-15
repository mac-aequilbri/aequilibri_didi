// Construction job-category catalog — curated industry reference data used by
// the Assessment Engine. Each category carries the engagement type it usually
// runs as, a scope hint to prime the intake, and an industry-standard phase
// sequence (AU residential/commercial practice).
//
// How it feeds the assessment: the phase plan is resolved learnings-first —
// prior jobs of the same category/engagement type take priority; this
// catalog is the EXPERT DEFAULT that fills the cold-start gap before an org
// has history; the AI only originates phases when neither exists. Either way
// the AI fits the week durations to the specific job.

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
    phases: [
      "Design, approvals & site survey",
      "Site preparation & earthworks",
      "Slab & footings",
      "Frame & roof structure",
      "Lock-up (roofing, cladding, windows)",
      "Rough-in (plumbing, electrical, HVAC)",
      "Internal linings & fit-out",
      "Finishes & external works",
      "Final inspections, defects & handover",
    ],
  },
  {
    key: "multi_dwelling",
    label: "Duplex / townhouses",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "Two or more attached dwellings on one site.",
    phases: [
      "Design & approvals",
      "Bulk earthworks & site services",
      "Slabs & footings",
      "Frame & roof",
      "Lock-up",
      "Services rough-in",
      "Linings & fit-out",
      "Finishes & landscaping",
      "Occupation certificate & handover",
    ],
  },
  {
    key: "apartment",
    label: "Apartment / multi-residential building",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "Multi-storey residential building.",
    phases: [
      "Design & DA approval",
      "Demolition & excavation",
      "Substructure & basement",
      "Superstructure (per level)",
      "Façade & roof",
      "Services rough-in",
      "Fit-out",
      "Common areas & external works",
      "Commissioning & handover",
    ],
  },
  {
    key: "commercial_fitout",
    label: "Commercial fit-out (new)",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "Tenancy fit-out — office, retail or hospitality.",
    phases: [
      "Design & permits",
      "Demolition & strip-out",
      "Partitions & ceilings",
      "Services (mechanical, electrical, hydraulic, fire)",
      "Joinery & finishes",
      "FF&E installation",
      "Commissioning & defects",
      "Handover",
    ],
  },
  {
    key: "granny_flat",
    label: "Granny flat / secondary dwelling",
    group: "New build",
    engagementType: "long_project",
    scopeHint: "Self-contained secondary dwelling.",
    phases: [
      "Design & approvals",
      "Site preparation & slab",
      "Frame & roof",
      "Lock-up",
      "Rough-in",
      "Lining & fit-out",
      "Finishes & connection",
      "Final inspection & handover",
    ],
  },
  {
    key: "shed_garage",
    label: "Shed / garage / outbuilding",
    group: "New build",
    engagementType: "short_job",
    scopeHint: "Detached shed, garage or carport.",
    phases: [
      "Permit & site set-out",
      "Footings & slab",
      "Frame & cladding erection",
      "Roofing",
      "Doors & fit-off",
      "Final check",
    ],
  },
  {
    key: "deck_pergola",
    label: "Deck / pergola / patio",
    group: "New build",
    engagementType: "short_job",
    scopeHint: "Outdoor deck, pergola or patio structure.",
    phases: [
      "Design & permit",
      "Footings & posts",
      "Framing",
      "Decking / roofing",
      "Balustrade & finish",
      "Final check",
    ],
  },

  // ── Renovation & extension ──────────────────────────────────────────
  {
    key: "kitchen_reno",
    label: "Kitchen renovation",
    group: "Renovation & extension",
    engagementType: "short_job",
    scopeHint: "Kitchen refurbishment — cabinetry, benchtops, appliances.",
    phases: [
      "Design & selections",
      "Strip-out",
      "Rough-in (plumbing & electrical)",
      "Plastering & prep",
      "Cabinetry & benchtops",
      "Splashback & tiling",
      "Fit-off (appliances, tapware)",
      "Final clean & handover",
    ],
  },
  {
    key: "bathroom_reno",
    label: "Bathroom renovation",
    group: "Renovation & extension",
    engagementType: "short_job",
    scopeHint: "Bathroom refurbishment — waterproofing, tiling, fixtures.",
    phases: [
      "Design & selections",
      "Strip-out & demolition",
      "Rough-in (plumbing & electrical)",
      "Waterproofing",
      "Wall & floor tiling",
      "Fit-off (vanity, toilet, screens)",
      "Final clean & handover",
    ],
  },
  {
    key: "whole_house_reno",
    label: "Whole-house renovation",
    group: "Renovation & extension",
    engagementType: "long_project",
    scopeHint: "Full internal renovation of an existing dwelling.",
    phases: [
      "Design & approvals",
      "Strip-out & demolition",
      "Structural works",
      "Rough-in services",
      "Plastering & linings",
      "Joinery & tiling",
      "Finishes & painting",
      "Fit-off & handover",
    ],
  },
  {
    key: "extension",
    label: "Extension / addition",
    group: "Renovation & extension",
    engagementType: "long_project",
    scopeHint: "Ground-floor extension or addition tied into the existing structure.",
    phases: [
      "Design & approvals",
      "Demolition & site prep",
      "Footings & slab",
      "Frame & roof",
      "Tie-in & lock-up",
      "Services rough-in",
      "Linings & fit-out",
      "Finishes & handover",
    ],
  },
  {
    key: "second_storey",
    label: "Second-storey addition",
    group: "Renovation & extension",
    engagementType: "long_project",
    scopeHint: "Adding a storey over an existing dwelling.",
    phases: [
      "Design & approvals",
      "Propping & roof removal",
      "New floor structure",
      "Frame & roof",
      "Lock-up",
      "Rough-in",
      "Linings & fit-out",
      "Finishes & handover",
    ],
  },
  {
    key: "garage_conversion",
    label: "Garage / room conversion",
    group: "Renovation & extension",
    engagementType: "short_job",
    scopeHint: "Convert an existing space into habitable rooms.",
    phases: [
      "Design & permit",
      "Strip-out",
      "Framing & insulation",
      "Rough-in",
      "Lining & flooring",
      "Finishes & fit-off",
      "Handover",
    ],
  },

  // ── Energy & services ───────────────────────────────────────────────
  {
    key: "solar_pv",
    label: "Solar PV installation",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Rooftop solar photovoltaic system — panels, inverter, grid connection.",
    phases: [
      "Site assessment & system design",
      "Approvals & grid application",
      "Mounting & panel installation",
      "Inverter & electrical",
      "Inspection, commissioning & connection",
    ],
  },
  {
    key: "battery_storage",
    label: "Battery storage installation",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Home/commercial battery energy storage system.",
    phases: [
      "Load assessment & design",
      "Approvals",
      "Mounting & installation",
      "Electrical integration",
      "Commissioning & handover",
    ],
  },
  {
    key: "hvac_install",
    label: "Air-conditioning / HVAC installation",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Split-system, ducted or VRF air-conditioning install.",
    phases: [
      "Heat-load assessment & design",
      "Equipment procurement",
      "Mounting & ducting",
      "Electrical & refrigerant",
      "Commissioning & handover",
    ],
  },
  {
    key: "hot_water",
    label: "Hot water system replacement",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Replace or upgrade a hot water unit (gas, electric, heat pump or solar).",
    phases: [
      "Assessment & sizing",
      "Removal of old unit",
      "Installation & connection",
      "Commissioning & handover",
    ],
  },
  {
    key: "electrical_rewire",
    label: "Electrical rewire / switchboard upgrade",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Rewire and/or switchboard and meter upgrade.",
    phases: [
      "Inspection & design",
      "Isolation & make-safe",
      "Cabling & rough-in",
      "Switchboard & fit-off",
      "Testing & certification",
    ],
  },
  {
    key: "replumb",
    label: "Re-pipe / plumbing reroute",
    group: "Energy & services",
    engagementType: "short_job",
    scopeHint: "Replace or reroute water/waste pipework.",
    phases: [
      "Assessment & design",
      "Access & demolition",
      "Pipework installation",
      "Pressure test & connection",
      "Reinstatement & handover",
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
      "Material procurement",
      "Strip existing roof",
      "Battens & sarking",
      "New roof installation",
      "Flashings & gutters",
      "Clean & final check",
    ],
  },
  {
    key: "roof_repair",
    label: "Roof repair / leak",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Localised roof repair or leak rectification.",
    phases: ["Inspection & diagnosis", "Make-safe", "Repair & reseal", "Test & verify"],
  },
  {
    key: "recladding",
    label: "Re-cladding / façade",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Replace external wall cladding or façade.",
    phases: [
      "Inspection & design",
      "Scaffold & access",
      "Remove existing cladding",
      "Wrap & batten",
      "New cladding installation",
      "Flashings & finish",
      "Clean & inspect",
    ],
  },
  {
    key: "guttering",
    label: "Gutter & downpipe replacement",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Replace gutters, fascia and downpipes.",
    phases: [
      "Measure & procurement",
      "Remove old guttering",
      "Install gutters & downpipes",
      "Test drainage & finish",
    ],
  },
  {
    key: "painting",
    label: "Painting (interior / exterior)",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Repaint interior and/or exterior surfaces.",
    phases: [
      "Preparation & protection",
      "Repairs & filling",
      "Priming / undercoat",
      "Top coats",
      "Detailing & clean-up",
    ],
  },
  {
    key: "waterproofing",
    label: "Waterproofing remediation",
    group: "Roofing & exterior",
    engagementType: "short_job",
    scopeHint: "Remediate failed waterproofing (balcony, wet area, basement).",
    phases: [
      "Inspection & moisture test",
      "Strip-out",
      "Substrate preparation",
      "Membrane application",
      "Flood test",
      "Reinstatement",
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
      "Set-out & permit",
      "Post holes & footings",
      "Panel / rail installation",
      "Gates & hardware",
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
      "Set-out & excavation",
      "Base preparation",
      "Formwork & reinforcement",
      "Pour / lay & finish",
      "Cure & seal",
    ],
  },
  {
    key: "landscaping",
    label: "Landscaping",
    group: "Outdoor & civil",
    engagementType: "short_job",
    scopeHint: "Soft and hard landscaping works.",
    phases: [
      "Design & plan",
      "Site clearing & earthworks",
      "Hardscaping",
      "Irrigation",
      "Planting & turf",
      "Final clean",
    ],
  },
  {
    key: "pool",
    label: "Pool installation",
    group: "Outdoor & civil",
    engagementType: "long_project",
    scopeHint: "In-ground concrete or fibreglass swimming pool.",
    phases: [
      "Design & approvals",
      "Excavation",
      "Shell (concrete / fibreglass)",
      "Plumbing & equipment",
      "Coping & tiling",
      "Fencing & compliance",
      "Commissioning & handover",
    ],
  },
  {
    key: "retaining_wall",
    label: "Retaining wall",
    group: "Outdoor & civil",
    engagementType: "short_job",
    scopeHint: "Engineered retaining wall.",
    phases: [
      "Design & engineering",
      "Excavation",
      "Footings & drainage",
      "Wall construction",
      "Backfill & finish",
    ],
  },
  {
    key: "demolition",
    label: "Demolition",
    group: "Outdoor & civil",
    engagementType: "short_job",
    scopeHint: "Full or partial demolition and site clearance.",
    phases: [
      "Permits & disconnections",
      "Asbestos / hazmat survey",
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
      "Insurance scope",
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
      "Repairs",
      "Re-inspection",
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
