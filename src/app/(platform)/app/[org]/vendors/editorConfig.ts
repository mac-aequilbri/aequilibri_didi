// Shared editor/detail config for a single vendor — consumed by both the
// read-only detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx).

import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const vendorEditorConfig: RecordEditorConfig = {
  table: "vendor",
  noun: "vendor",
  listPath: "/vendors",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager keep a clean vendor registry — sensible category labels and useful notes.",
  fields: [
    { name: "name", label: "Vendor name", type: "text", required: true },
    { name: "category", label: "Category", type: "text", aiFillable: true },
    { name: "contactName", label: "Contact name", type: "text" },
    { name: "contactEmail", label: "Contact email", type: "email" },
    { name: "contactPhone", label: "Contact phone", type: "tel" },
    { name: "rating", label: "Rating (1–10)", type: "number", min: 1, max: 10 },
    { name: "notes", label: "Notes", type: "textarea", full: true, aiFillable: true },
    { name: "isActive", label: "Active", type: "checkbox" },
  ],
};
