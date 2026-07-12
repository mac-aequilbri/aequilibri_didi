// Filter config for the Risk Register — consumed by the page (parse +
// applyListQuery) and the shared FilterBar. Severity bands are virtual options
// derived from likelihood × impact, matching the page's score colouring.

import type { ListViewConfig } from "@/lib/platform/listQuery";
import type { RiskView } from "@/lib/platform/risksSource";

const score = (r: RiskView) => r.likelihood * r.impact;

export const risksListConfig: ListViewConfig<RiskView> = {
  search: [(r) => r.description, (r) => r.mitigation, (r) => r.owner],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      getValue: (r) => r.status.toLowerCase(),
      options: [
        { value: "open" },
        { value: "accepted" },
        { value: "mitigated" },
        { value: "closed" },
      ],
    },
    {
      kind: "enum",
      name: "severity",
      label: "Severity",
      options: [
        { value: "high", label: "high (15+)", match: (r) => score(r) >= 15 },
        { value: "medium", label: "medium (8–14)", match: (r) => score(r) >= 8 && score(r) < 15 },
        { value: "low", label: "low (under 8)", match: (r) => score(r) < 8 },
      ],
    },
    {
      kind: "enum",
      name: "flags",
      label: "Flags",
      options: [
        { value: "escalated", match: (r) => r.escalatedAt !== null },
        { value: "ai", label: "AI-created", match: (r) => r.createdByAi },
      ],
    },
  ],
  pageSize: 50,
};
