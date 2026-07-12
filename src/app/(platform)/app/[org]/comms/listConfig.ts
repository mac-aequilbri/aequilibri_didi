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
  pageSize: 50,
};
