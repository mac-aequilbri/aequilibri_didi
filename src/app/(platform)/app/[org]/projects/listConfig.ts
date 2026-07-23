// Filter config for the Projects window — consumed by the page (parse +
// applyListQuery) and the shared FilterBar.

import type { JobListView } from "@/lib/platform/jobsListSource";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const projectsListConfig: ListViewConfig<JobListView> = {
  search: [(j) => j.name, (j) => j.code, (j) => j.suburb, (j) => j.address],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      getValue: (j) => j.status.toLowerCase(),
      options: ["open", "active", "on_hold", "complete", "closed"].map((s) => ({
        value: s,
        label: s.replace("_", " "),
      })),
    },
  ],
  sort: [
    { name: "name", label: "Name", getValue: (j) => j.name.toLowerCase() },
    { name: "code", label: "Code", getValue: (j) => j.code.toLowerCase() },
    { name: "status", label: "Status", getValue: (j) => j.status.toLowerCase() },
    { name: "completion", label: "Completion", getValue: (j) => j.completionPct },
    { name: "health", label: "Health score", getValue: (j) => j.healthScore },
    { name: "budget", label: "Budget", getValue: (j) => j.budgetTotal },
  ],
  groups: [
    {
      name: "status",
      label: "Status",
      getValue: (j) => j.status.toLowerCase(),
      options: ["open", "active", "on_hold", "complete", "closed"].map((s) => ({
        value: s,
        label: s.replace("_", " "),
      })),
    },
    { name: "engagementType", label: "Engagement type", getValue: (j) => j.engagementType || null },
    { name: "suburb", label: "Suburb", getValue: (j) => j.suburb || null },
  ],
  pageSize: 50,
};
