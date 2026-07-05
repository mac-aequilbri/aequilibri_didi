// Loads a vertical's job-category catalog from the control base and maps it to
// the JobCategory shape the Assessment Engine + intake form use. Returns [] when
// the control base isn't configured or the vertical has no catalog yet — the
// engine already treats "no category" as a valid path (AI-suggested phases), so
// an empty catalog degrades gracefully rather than breaking assessment.

import { controlEnabled, listJobCatalog } from "@/lib/airtable/control";
import type { EngagementType, JobCategory } from "./jobCatalog";

const ENGAGEMENTS: EngagementType[] = ["short_job", "long_project", "ongoing", "seasonal"];

export async function loadJobCatalog(vertical: string): Promise<JobCategory[]> {
  if (!controlEnabled() || !vertical) return [];
  const rows = await listJobCatalog(vertical);
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    group: r.group || "General",
    engagementType: (ENGAGEMENTS.includes(r.engagementType as EngagementType)
      ? r.engagementType
      : "short_job") as EngagementType,
    scopeHint: r.scopeHint,
    phases: r.phases,
  }));
}
