// Shared editor/detail config for a single plan task — consumed by both the
// read-only detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx).
// Predecessor/Assigned_To links are not edited here (second-pass linking per
// the onboarding playbook, until the L5 Gantt lands).

import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const planEditorConfig: RecordEditorConfig = {
  table: "plan",
  jobScoped: true,
  noun: "plan task",
  listPath: "/plan",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager keep the task-level schedule accurate — clear task names and helpful notes.",
  fields: [
    { name: "name", label: "Task", type: "text", full: true, required: true, aiFillable: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Not Started", label: "Not Started" },
        { value: "In Progress", label: "In Progress" },
        { value: "Complete", label: "Complete" },
        { value: "Blocked", label: "Blocked" },
        { value: "Deferred", label: "Deferred" },
      ],
    },
    {
      name: "rag",
      label: "RAG",
      type: "select",
      options: [
        { value: "", label: "—" },
        { value: "Green", label: "Green" },
        { value: "Amber", label: "Amber" },
        { value: "Red", label: "Red" },
      ],
    },
    { name: "startDate", label: "Start date", type: "date" },
    { name: "endDate", label: "End date", type: "date" },
    { name: "durationDays", label: "Duration (days)", type: "number", min: 0, step: 1 },
    { name: "notes", label: "Notes", type: "textarea", full: true, aiFillable: true },
  ],
};
