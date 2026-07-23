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
  sort: [
    {
      name: "due",
      label: "Due date",
      getValue: (o) =>
        o.dueDate ? (o.dueDate instanceof Date ? o.dueDate : new Date(o.dueDate)) : null,
    },
    { name: "total", label: "Amount", getValue: (o) => o.total },
    { name: "delta", label: "Delivery delta", getValue: (o) => o.deltaDays },
    { name: "item", label: "Item", getValue: (o) => o.item.toLowerCase() },
    { name: "status", label: "Status", getValue: (o) => o.status.toLowerCase() },
  ],
  groups: [
    {
      name: "status",
      label: "Status",
      getValue: (o) => o.status.toLowerCase(),
      options: ["pending", "ordered", "delivered", "invoiced", "paid"].map((v) => ({ value: v })),
    },
    {
      name: "late",
      label: "Delivery",
      getValue: (o) => (o.isLate ? "late" : "ontime"),
      options: [
        { value: "late", label: "Late" },
        { value: "ontime", label: "On time" },
      ],
    },
    { name: "project", label: "Project", getValue: (o) => o.jobCode || null },
  ],
  pageSize: 50,
};
