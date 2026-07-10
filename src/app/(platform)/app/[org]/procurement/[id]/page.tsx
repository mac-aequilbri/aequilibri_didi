// Single procurement-order edit page. Reachable by clicking a row on the list.

import RecordEditPage from "../../_record-edit/RecordEditPage";
import { loadProcurementDetail } from "@/lib/platform/procurementSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const dynamic = "force-dynamic";

const config: RecordEditorConfig = {
  table: "procurement",
  noun: "order",
  listPath: "/procurement",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager keep procurement orders clearly described.",
  fields: [
    { name: "item", label: "Item", type: "text", full: true, required: true, aiFillable: true },
    { name: "qty", label: "Quantity", type: "number", min: 0, step: 1 },
    { name: "unitPrice", label: "Unit price", type: "number", min: 0, step: 0.01 },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "pending", label: "pending" },
        { value: "ordered", label: "ordered" },
        { value: "delivered", label: "delivered" },
        { value: "invoiced", label: "invoiced" },
        { value: "paid", label: "paid" },
      ],
    },
    { name: "dueDate", label: "Due date", type: "date" },
  ],
};

export default async function ProcurementDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadProcurementDetail(ctx, id);
  return (
    <RecordEditPage
      orgSlug={ctx.orgSlug}
      config={config}
      values={values}
      recordId={id}
      subtitle={values ? String(values.item) : undefined}
    />
  );
}
