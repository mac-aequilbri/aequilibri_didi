// Filter config for the Risk Register — consumed by the page (parse +
// applyListQuery) and the shared FilterBar. Severity bands are virtual options
// derived from likelihood × impact, matching the page's score colouring.

import type { ListViewConfig } from "@/lib/platform/listQuery";
import type { RiskView } from "@/lib/platform/risksSource";

const score = (r: RiskView) => r.likelihood * r.impact;

export const risksListConfig: ListViewConfig<RiskView> = {
  search: [(r) => r.description, (r) => r.mitigation, (r) => r.owner, (r) => r.jobCode],
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
  sort: [
    { name: "severity", label: "Severity score", getValue: (r) => score(r) },
    { name: "status", label: "Status", getValue: (r) => r.status.toLowerCase() },
    { name: "owner", label: "Owner", getValue: (r) => r.owner.toLowerCase() },
    { name: "description", label: "Description", getValue: (r) => r.description.toLowerCase() },
  ],
  groups: [
    {
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
      name: "severity",
      label: "Severity",
      getValue: (r) => (score(r) >= 15 ? "high" : score(r) >= 8 ? "medium" : "low"),
      options: [
        { value: "high", label: "High (15+)" },
        { value: "medium", label: "Medium (8–14)" },
        { value: "low", label: "Low (under 8)" },
      ],
    },
    {
      name: "rag",
      label: "RAG",
      getValue: (r) => r.rag || null,
      options: [{ value: "Red" }, { value: "Amber" }, { value: "Green" }],
    },
    { name: "category", label: "Category", getValue: (r) => r.category || null },
    { name: "owner", label: "Owner", getValue: (r) => r.owner || null },
    { name: "project", label: "Project", getValue: (r) => r.jobCode || null },
  ],
  pageSize: 50,
};
