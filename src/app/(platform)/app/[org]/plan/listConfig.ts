// Filter config for the Plan (PLAN task schedule) window — consumed by the page
// (parse + applyListQuery) and the shared FilterBar. "overdue" matches the
// derived past-end-date flag, not a stored status.

import type { PlanTaskView } from "@/lib/platform/planSource";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const planListConfig: ListViewConfig<PlanTaskView> = {
  search: [(t) => t.name, (t) => t.notes, (t) => t.jobName, (t) => t.phaseName, (t) => t.assignedTo],
  fields: [
    {
      kind: "enum",
      name: "status",
      label: "Status",
      options: [
        { value: "Not Started" },
        { value: "In Progress" },
        { value: "Complete" },
        { value: "Blocked" },
        { value: "Deferred" },
        { value: "overdue", match: (t) => t.isOverdue },
      ],
    },
    {
      kind: "enum",
      name: "rag",
      label: "RAG",
      options: [{ value: "Green" }, { value: "Amber" }, { value: "Red" }],
    },
    { kind: "daterange", name: "start", label: "Start", getValue: (t) => t.startDate },
    { kind: "daterange", name: "end", label: "End", getValue: (t) => t.endDate },
  ],
  sort: [
    { name: "start", label: "Start date", getValue: (t) => t.startDate },
    { name: "end", label: "End date", getValue: (t) => t.endDate },
    { name: "name", label: "Task", getValue: (t) => t.name.toLowerCase() },
    { name: "status", label: "Status", getValue: (t) => t.status.toLowerCase() },
  ],
  groups: [
    {
      name: "status",
      label: "Status",
      getValue: (t) => t.status || null,
      options: [
        { value: "Not Started" },
        { value: "In Progress" },
        { value: "Complete" },
        { value: "Blocked" },
        { value: "Deferred" },
      ],
    },
    { name: "phase", label: "Phase", getValue: (t) => t.phaseName || null },
    { name: "assignee", label: "Assigned to", getValue: (t) => t.assignedTo || null },
    { name: "project", label: "Project", getValue: (t) => t.jobName || null },
  ],
  pageSize: 50,
};
