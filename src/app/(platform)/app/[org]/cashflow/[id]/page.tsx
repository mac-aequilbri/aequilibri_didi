// Single cashflow-entry edit page. Reachable by clicking a ledger row.

import RecordEditPage from "../../_record-edit/RecordEditPage";
import { loadCashflowDetail } from "@/lib/platform/cashflowSource";
import { requireFinancialAccess, requireOrgCtx } from "@/lib/platform/org-context";
import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const dynamic = "force-dynamic";

const config: RecordEditorConfig = {
  table: "cashflow",
  jobScoped: true,
  noun: "cashflow entry",
  listPath: "/cashflow",
  aiRole:
    "You are an operations assistant helping a construction manager keep a cashflow ledger clearly labelled.",
  fields: [
    { name: "name", label: "Entry name", type: "text", full: true, aiFillable: true },
    { name: "period", label: "Period (YYYY-MM)", type: "text" },
    {
      name: "type",
      label: "Type",
      type: "select",
      options: [
        { value: "Out", label: "Out" },
        { value: "In", label: "In" },
      ],
    },
    { name: "amount", label: "Amount", type: "number", min: 0, step: 0.01 },
    { name: "sourceOrPayee", label: "Source / payee", type: "text" },
    { name: "category", label: "Category", type: "text" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Forecast", label: "Forecast" },
        { value: "Confirmed", label: "Confirmed" },
        { value: "Paid", label: "Paid" },
        { value: "Overdue", label: "Overdue" },
      ],
    },
    { name: "notes", label: "Notes", type: "textarea", full: true, aiFillable: true },
  ],
};

export default async function CashflowDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  await requireFinancialAccess(ctx);
  const values = await loadCashflowDetail(ctx, id);
  return (
    <RecordEditPage
      orgSlug={ctx.orgSlug}
      config={config}
      values={values}
      recordId={id}
      subtitle={values ? String(values.name || values.period) : undefined}
    />
  );
}
