// Single-risk edit page — the explicit Edit step from the risk detail view.
// Back/Cancel and post-save return to the detail page.

import RecordEditPage from "../../../_record-edit/RecordEditPage";
import { riskEditorConfig as config } from "../../editorConfig";
import { loadRiskDetail } from "@/lib/platform/risksSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function RiskEditPage({
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
      returnPath={`${config.listPath}/${id}`}
    />
  );
}
