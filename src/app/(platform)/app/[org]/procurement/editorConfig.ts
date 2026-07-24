// Shared editor/detail config for a single procurement order — consumed by both
// the read-only detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx).

import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const procurementEditorConfig: RecordEditorConfig = {
  table: "procurement",
  jobScoped: true,
  noun: "order",
  listPath: "/procurement",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager keep procurement orders clearly described.",
  fields: [
    { name: "item", label: "Item", type: "text", full: true, required: true, aiFillable: true },
    { name: "qty", label: "Quantity", type: "number", min: 0, step: 1 },
    { name: "unitPrice", label: "Unit price", type: "number", min: 0, step: 0.01 },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "pending", label: "pending" },
        { value: "ordered", label: "ordered" },
        { value: "delivered", label: "delivered" },
        { value: "invoiced", label: "invoiced" },
        { value: "paid", label: "paid" },
      ],
    },
    { name: "dueDate", label: "Due date", type: "date", noPast: true },
  ],
};
