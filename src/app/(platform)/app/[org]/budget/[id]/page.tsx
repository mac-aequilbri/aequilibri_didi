// Single budget-line edit page. Reachable by clicking a line on the Budget page.
// Actual is a derived rollup (confirmed procurement) — shown read-only.

import RecordEditPage from "../../_record-edit/RecordEditPage";
import { loadBudgetLineDetail } from "@/lib/platform/budgetSource";
import { requireFinancialAccess, requireOrgCtx } from "@/lib/platform/org-context";
import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const dynamic = "force-dynamic";

const config: RecordEditorConfig = {
  table: "budget_line",
  jobScoped: true,
  noun: "budget line",
  listPath: "/budget",
  aiRole:
    "You are an operations assistant helping a construction manager keep budget lines clearly labelled and described.",
  fields: [
    { name: "category", label: "Category", type: "text", aiFillable: true },
    { name: "description", label: "Description", type: "textarea", full: true, aiFillable: true },
    { name: "budgetAmount", label: "Estimated", type: "number", min: 0, step: 0.01 },
    { name: "forecast", label: "Forecast", type: "number", min: 0, step: 0.01 },
    { name: "rag", label: "RAG", type: "text" },
    { name: "actualAmount", label: "Actual (from procurement)", type: "number", readOnly: true },
  ],
};

export default async function BudgetLineDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  await requireFinancialAccess(ctx);
  const values = await loadBudgetLineDetail(ctx, id);
  return (
    <RecordEditPage
      orgSlug={ctx.orgSlug}
      config={config}
      values={values}
      recordId={id}
      subtitle={values ? String(values.category || values.description) : undefined}
    />
  );
}
