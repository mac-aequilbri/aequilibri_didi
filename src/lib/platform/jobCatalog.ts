// Job-category types + pure helpers for the Assessment Engine.
//
// The catalog itself is DATA, not code: categories (label + industry-standard
// phase sequence) live in the control base's PLAT_JOB_CATALOG table, keyed by
// vertical. Construction/roofing are seeded from curated data
// (scripts/airtable-seed-job-catalog.mjs); a brand-new industry gets an
// AI-drafted catalog at onboarding (services/platform/jobCatalogGenerator).
// Load a vertical's categories with jobCatalogSource.loadJobCatalog(), then use
// the helpers below — they operate on the loaded list, never a hardcoded one.

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

/** Look up one category by key within a loaded catalog. */
export function findCategory(
  categories: JobCategory[],
  key: string | null | undefined,
): JobCategory | null {
  if (!key) return null;
  return categories.find((c) => c.key === key) ?? null;
}

/** Group a loaded catalog by `group`, preserving order — for <optgroup>. */
export function groupCatalog(
  categories: JobCategory[],
): { group: string; categories: JobCategory[] }[] {
  const groups: { group: string; categories: JobCategory[] }[] = [];
  for (const cat of categories) {
    let g = groups.find((x) => x.group === cat.group);
    if (!g) {
      g = { group: cat.group || "General", categories: [] };
      groups.push(g);
    }
    g.categories.push(cat);
  }
  return groups;
}
