// Filter config for the Quotes window — consumed by the page (parse +
// applyListQuery) and the shared FilterBar.

import type { QuoteView } from "@/lib/platform/domainListSources";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const quotesListConfig: ListViewConfig<QuoteView> = {
  search: [(q) => q.title, (q) => q.clientName, (q) => q.refNumber, (q) => q.jobCode],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      getValue: (q) => q.status.toLowerCase(),
      options: ["draft", "sent", "accepted", "rejected", "expired"].map((v) => ({ value: v })),
    },
    {
      kind: "daterange",
      name: "valid",
      label: "Valid until",
      getValue: (q) =>
        q.validUntil ? (q.validUntil instanceof Date ? q.validUntil : new Date(q.validUntil)) : null,
    },
  ],
  sort: [
    {
      name: "valid",
      label: "Valid until",
      getValue: (q) =>
        q.validUntil ? (q.validUntil instanceof Date ? q.validUntil : new Date(q.validUntil)) : null,
    },
    { name: "total", label: "Total", getValue: (q) => q.total },
    { name: "title", label: "Title", getValue: (q) => q.title.toLowerCase() },
    { name: "client", label: "Client", getValue: (q) => q.clientName.toLowerCase() },
    { name: "status", label: "Status", getValue: (q) => q.status.toLowerCase() },
  ],
  groups: [
    {
      name: "status",
      label: "Status",
      getValue: (q) => q.status.toLowerCase(),
      options: ["draft", "sent", "accepted", "rejected", "expired"].map((v) => ({ value: v })),
    },
    { name: "client", label: "Client", getValue: (q) => q.clientName || null },
    { name: "project", label: "Project", getValue: (q) => q.jobCode || null },
  ],
  pageSize: 50,
};
