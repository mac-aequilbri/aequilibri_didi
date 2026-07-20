// Single-risk detail page (read-only). Reachable by clicking a row on the Risk
// Register; editing is an explicit step via the header's Edit action.

import RecordDetailPage from "../../_record-edit/RecordDetailPage";
import { riskEditorConfig as config } from "../editorConfig";
import { loadRiskDetail } from "@/lib/platform/risksSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function RiskDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadRiskDetail(ctx, id);
  return <RecordDetailPage orgSlug={ctx.orgSlug} config={config} values={values} recordId={id} />;
}
