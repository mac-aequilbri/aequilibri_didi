// Shared editor/detail config for a single communication — consumed by both the
// read-only detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx).

import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const commEditorConfig: RecordEditorConfig = {
  table: "comms",
  noun: "communication",
  listPath: "/comms",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager plan stakeholder communications — clear topics and helpful notes.",
  fields: [
    { name: "topic", label: "Topic", type: "text", full: true, required: true, aiFillable: true },
    {
      name: "messageType",
      label: "Type",
      type: "select",
      options: [
        { value: "Decision Notification", label: "Decision Notification" },
        { value: "Status Update", label: "Status Update" },
        { value: "Action Required", label: "Action Required" },
        { value: "Approval Request", label: "Approval Request" },
        { value: "Escalation", label: "Escalation" },
      ],
    },
    {
      name: "stakeholderRole",
      label: "Stakeholder role",
      type: "select",
      options: [
        { value: "Owner", label: "Owner" },
        { value: "Builder", label: "Builder" },
        { value: "Architect", label: "Architect" },
        { value: "Broker", label: "Broker" },
        { value: "Supplier", label: "Supplier" },
        { value: "Regulatory", label: "Regulatory" },
        { value: "Other", label: "Other" },
      ],
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "pending", label: "pending" },
        { value: "sent", label: "sent" },
        { value: "acknowledged", label: "acknowledged" },
        { value: "overdue", label: "overdue" },
      ],
    },
    { name: "dueDate", label: "Due date", type: "date", noPast: true },
    { name: "sentBy", label: "Sent by", type: "text" },
    { name: "notes", label: "Notes", type: "textarea", full: true, aiFillable: true },
  ],
};
