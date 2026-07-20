// Shared editor/detail config for a single risk — consumed by both the
// read-only detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx).

import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const riskEditorConfig: RecordEditorConfig = {
  table: "risk",
  noun: "risk",
  listPath: "/risks",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager keep a risk register sharp — clear risk statements and actionable mitigations.",
  fields: [
    { name: "description", label: "Risk", type: "textarea", full: true, required: true, aiFillable: true },
    {
      name: "likelihood",
      label: "Likelihood (1–5)",
      type: "select",
      options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
    },
    {
      name: "impact",
      label: "Impact (1–5)",
      type: "select",
      options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
    },
    { name: "mitigation", label: "Mitigation", type: "textarea", full: true, aiFillable: true },
    { name: "owner", label: "Owner", type: "text" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "open", label: "open" },
        { value: "accepted", label: "accepted" },
        { value: "mitigated", label: "mitigated" },
        { value: "closed", label: "closed" },
      ],
    },
  ],
};
