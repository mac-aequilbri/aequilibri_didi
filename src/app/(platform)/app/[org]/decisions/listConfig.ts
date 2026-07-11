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
};
