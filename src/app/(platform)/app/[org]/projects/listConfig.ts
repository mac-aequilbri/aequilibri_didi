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
  pageSize: 50,
};
