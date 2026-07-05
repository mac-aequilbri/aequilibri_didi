// Curated industry → sub-industry taxonomy that seeds the template-mapping
// dropdowns. It is a *convenience* list, not a constraint: the New mapping form
// always offers an "Other (not in the list)…" escape hatch for both fields, and
// any industry already present in the template registry is merged in on top of
// this, so the list stays current as new verticals are onboarded.

export const INDUSTRY_TAXONOMY: Record<string, string[]> = {
  Construction: [
    "Project Delivery",
    "Residential Building",
    "Commercial Building",
    "Civil & Infrastructure",
    "Fit-out & Renovation",
  ],
  Roofing: ["PCR Estimation", "Residential Roofing", "Commercial Roofing", "Roof Repair & Maintenance"],
  Solar: ["Residential Solar", "Commercial Solar", "Solar Maintenance"],
  Electrical: ["Residential", "Commercial", "Industrial"],
  Plumbing: ["Residential", "Commercial", "Drainage"],
  HVAC: ["Installation", "Maintenance & Service"],
  Landscaping: ["Design & Build", "Grounds Maintenance"],
  "Civil Engineering": ["Roads & Highways", "Utilities", "Structures"],
  Architecture: ["Residential", "Commercial", "Interior"],
  Legal: ["Litigation", "Corporate", "Conveyancing"],
  Accounting: ["Audit", "Tax", "Advisory"],
  "Real Estate": ["Sales", "Leasing", "Development"],
  "Property Management": ["Residential", "Commercial", "Facilities"],
};

/** Ordered, de-duplicated industry list: taxonomy first, then any extras. */
export function industryOptions(extra: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...Object.keys(INDUSTRY_TAXONOMY), ...extra]) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
