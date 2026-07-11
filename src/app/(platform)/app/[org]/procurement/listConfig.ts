// Filter config for the Procurement window — consumed by the page (parse +
// applyListQuery) and the shared FilterBar.

import type { ListViewConfig } from "@/lib/platform/listQuery";
import type { ProcurementView } from "@/lib/platform/procurementSource";

export const procurementListConfig: ListViewConfig<ProcurementView> = {
  search: [(o) => o.item, (o) => o.vendorName],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      // Airtable may carry capitalised option names; the app vocabulary is lower.
      getValue: (o) => o.status.toLowerCase(),
      options: ["pending", "ordered", "delivered", "invoiced", "paid"].map((v) => ({ value: v })),
    },
    {
      kind: "daterange",
      name: "due",
      label: "Due",
      getValue: (o) =>
        o.dueDate ? (o.dueDate instanceof Date ? o.dueDate : new Date(o.dueDate)) : null,
    },
  ],
};
