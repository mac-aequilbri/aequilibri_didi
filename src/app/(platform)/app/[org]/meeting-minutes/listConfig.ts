// Filter config for the Meeting Minutes window — consumed by the page
// (parse + applyListQuery) and the shared FilterBar.

import type { MinutesView } from "@/lib/platform/domainListSources";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const minutesListConfig: ListViewConfig<MinutesView> = {
  search: [(m) => m.title, (m) => m.jobCode],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      getValue: (m) => m.status.toLowerCase(),
      options: ["raw", "processed", "confirmed"].map((v) => ({ value: v })),
    },
    {
      kind: "daterange",
      name: "meeting",
      label: "Meeting date",
      getValue: (m) =>
        m.meetingDate
          ? m.meetingDate instanceof Date
            ? m.meetingDate
            : new Date(m.meetingDate)
          : null,
    },
  ],
};
