// Shared editor/detail config for a single phase — consumed by both the
// read-only detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx).

import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const phaseEditorConfig: RecordEditorConfig = {
  table: "phase",
  noun: "phase",
  listPath: "/phases",
  aiRole:
    "You are an operations assistant helping a construction manager name project phases clearly and consistently.",
  fields: [
    { name: "name", label: "Phase name", type: "text", full: true, required: true, aiFillable: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "pending", label: "pending" },
        { value: "in_progress", label: "in progress" },
        { value: "complete", label: "complete" },
      ],
    },
    { name: "completionPct", label: "Completion %", type: "number", min: 0, max: 100 },
    { name: "sortOrder", label: "Sort order", type: "number", min: 0 },
  ],
};
