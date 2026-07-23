// Filter config for the Coordination Schedule (COMMS) — consumed by the page
// (parse + applyListQuery) and the shared FilterBar. "overdue" matches both the
// stored status and the derived pending-past-due flag.

import type { CommView } from "@/lib/platform/commsSource";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const commsListConfig: ListViewConfig<CommView> = {
  search: [(c) => c.topic, (c) => c.notes, (c) => c.messageType, (c) => c.stakeholderRole],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      options: [
        { value: "pending" },
        { value: "sent" },
        { value: "acknowledged" },
        { value: "overdue", match: (c) => c.isOverdue || c.status === "overdue" },
      ],
    },
    { kind: "daterange", name: "due", label: "Due", getValue: (c) => c.dueDate },
  ],
  sort: [
    { name: "due", label: "Due date", getValue: (c) => c.dueDate },
    { name: "topic", label: "Topic", getValue: (c) => c.topic.toLowerCase() },
    { name: "status", label: "Status", getValue: (c) => c.status.toLowerCase() },
  ],
  groups: [
    {
      name: "status",
      label: "Status",
      getValue: (c) => c.status.toLowerCase(),
      options: [
        { value: "pending" },
        { value: "sent" },
        { value: "acknowledged" },
        { value: "overdue" },
      ],
    },
    { name: "type", label: "Message type", getValue: (c) => c.messageType || null },
    { name: "role", label: "Stakeholder role", getValue: (c) => c.stakeholderRole || null },
    { name: "sentBy", label: "Sent by", getValue: (c) => c.sentBy || null },
  ],
  pageSize: 50,
};
