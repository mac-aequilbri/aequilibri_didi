// Single-risk edit page. Reachable by clicking a row on the Risk Register.

import RecordEditPage from "../../_record-edit/RecordEditPage";
import { loadRiskDetail } from "@/lib/platform/risksSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const dynamic = "force-dynamic";

const config: RecordEditorConfig = {
  table: "risk",
  noun: "risk",
  listPath: "/risks",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager keep a risk register sharp — clear risk statements and actionable mitigations.",
  fields: [
    { name: "description", label: "Risk", type: "textarea", full: true, required: true, aiFillable: true },
    { name: "likelihood", label: "Likelihood (1–5)", type: "number", min: 1, max: 5 },
    { name: "impact", label: "Impact (1–5)", type: "number", min: 1, max: 5 },
    { name: "mitigation", label: "Mitigation", type: "textarea", full: true, aiFillable: true },
    { name: "owner", label: "Owner", type: "text" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "open", label: "open" },
        { value: "accepted", label: "accepted" },
        { value: "mitigated", label: "mitigated" },
        { value: "closed", label: "closed" },
      ],
    },
  ],
};

export default async function RiskDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadRiskDetail(ctx, id);
  return (
    <RecordEditPage
      orgSlug={ctx.orgSlug}
      config={config}
      values={values}
      recordId={id}
      subtitle={values ? String(values.description) : undefined}
    />
  );
}
