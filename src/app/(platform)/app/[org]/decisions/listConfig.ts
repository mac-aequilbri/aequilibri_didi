// Filter config for the Decisions window — consumed by the page (parse +
// applyListQuery) and the shared FilterBar. See lib/platform/listQuery.ts.

import type { DecisionView } from "@/lib/platform/decisionsSource";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const decisionsListConfig: ListViewConfig<DecisionView> = {
  search: [(d) => d.description, (d) => d.rationale, (d) => d.madeBy],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      options: [{ value: "proposed" }, { value: "confirmed" }, { value: "superseded" }],
    },
    {
      kind: "daterange",
      name: "date",
      label: "Date",
      getValue: (d) => (d.date ? new Date(d.date) : null),
    },
  ],
  sort: [
    { name: "date", label: "Date", getValue: (d) => (d.date ? new Date(d.date) : null) },
    { name: "description", label: "Description", getValue: (d) => d.description.toLowerCase() },
    { name: "madeBy", label: "Made by", getValue: (d) => d.madeBy.toLowerCase() },
    { name: "status", label: "Status", getValue: (d) => d.status.toLowerCase() },
  ],
  groups: [
    {
      name: "status",
      label: "Status",
      getValue: (d) => d.status.toLowerCase(),
      options: [{ value: "proposed" }, { value: "confirmed" }, { value: "superseded" }],
    },
    { name: "source", label: "Source", getValue: (d) => d.sourceType || null },
    { name: "project", label: "Project", getValue: (d) => d.jobCode || null },
  ],
  pageSize: 50,
};
