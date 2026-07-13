// Filter config for the Variation Orders window — consumed by the page
// (parse + applyListQuery) and the shared FilterBar.

import type { VariationView } from "@/lib/platform/domainListSources";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const variationsListConfig: ListViewConfig<VariationView> = {
  search: [(v) => v.title, (v) => v.refNumber, (v) => v.jobCode],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      getValue: (v) => v.status.toLowerCase(),
      options: ["draft", "submitted", "approved", "rejected"].map((v) => ({ value: v })),
    },
    {
      kind: "enum",
      name: "origin",
      label: "Origin",
      options: [
        { value: "ai", label: "AI-drafted", match: (v) => v.isAiDrafted },
        { value: "manual", match: (v) => !v.isAiDrafted },
      ],
    },
  ],
  sort: [
    { name: "ref", label: "Reference", getValue: (v) => v.refNumber.toLowerCase() },
    { name: "title", label: "Title", getValue: (v) => v.title.toLowerCase() },
    { name: "cost", label: "Cost impact", getValue: (v) => v.costImpact },
    { name: "time", label: "Time impact", getValue: (v) => v.timeImpactDays },
    { name: "status", label: "Status", getValue: (v) => v.status.toLowerCase() },
  ],
  pageSize: 50,
};
