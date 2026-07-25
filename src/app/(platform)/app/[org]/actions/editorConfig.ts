// Shared editor/detail config for a single action — consumed by the read-only
// detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx). Replaces
// the bespoke ActionEditor (the component RecordEditor originally generalised),
// so actions now follow the same detail → explicit-Edit paradigm as every
// other register, saving through the shared updateRecordDetail path
// (recordWriter routes Airtable/Postgres by id shape).

import { ACTION_STATUSES } from "@/lib/platform/actionStatus";
import type { ActionDetail } from "@/lib/platform/actionsSource";
import type { EditorValues, RecordEditorConfig } from "@/lib/platform/recordEditor";

export const actionEditorConfig: RecordEditorConfig = {
  table: "action",
  jobScoped: true,
  noun: "action",
  listPath: "/actions",
  aiRole:
    "You are an operations assistant helping a project manager keep the action hub sharp — crisp titles, a concrete next step in the detail, a realistic owner and due date.",
  fields: [
    { name: "title", label: "Action", type: "text", full: true, required: true, aiFillable: true },
    { name: "detail", label: "Detail", type: "textarea", full: true, aiFillable: true },
    { name: "owner", label: "Owner", type: "text", aiFillable: true },
    { name: "dueDate", label: "Due date", type: "date" },
    {
      name: "priority",
      label: "Priority",
      type: "select",
      options: ["P1", "P2", "P3"].map((p) => ({ value: p, label: p })),
      aiFillable: true,
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: ACTION_STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") })),
    },
    { name: "issueType", label: "Type", type: "text", readOnly: true },
  ],
};

/** Form-ready values from a loaded action (date → the YYYY-MM-DD an
 *  `<input type="date">` expects, in local time). */
export function actionEditorValues(a: ActionDetail | null): EditorValues | null {
  if (!a) return null;
  const due = a.dueDate
    ? new Date(a.dueDate.getTime() - a.dueDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    : "";
  return {
    title: a.title,
    detail: a.detail,
    owner: a.owner,
    dueDate: due,
    priority: a.priority && a.priority !== "—" ? a.priority : "P2",
    status: a.status,
    issueType: a.issueType,
  };
}
