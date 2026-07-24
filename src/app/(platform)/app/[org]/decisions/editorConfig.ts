// Shared editor/detail config for a single decision — consumed by both the
// read-only detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx).

import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const decisionEditorConfig: RecordEditorConfig = {
  table: "decision",
  jobScoped: true,
  noun: "decision",
  listPath: "/decisions",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager record a project decision clearly and traceably.",
  fields: [
    { name: "description", label: "Decision", type: "textarea", full: true, required: true, aiFillable: true },
    { name: "rationale", label: "Rationale", type: "textarea", full: true, aiFillable: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "proposed", label: "proposed" },
        { value: "confirmed", label: "confirmed" },
        { value: "superseded", label: "superseded" },
      ],
    },
    { name: "decidedAt", label: "Decided on", type: "date" },
  ],
};
