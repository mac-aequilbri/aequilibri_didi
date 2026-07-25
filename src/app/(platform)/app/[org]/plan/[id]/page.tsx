// Single plan task detail page (read-only). Reachable by clicking a row on the
// Plan window; editing is an explicit step via the header's Edit action.

import RecordDetailPage from "../../_record-edit/RecordDetailPage";
import { planEditorConfig as config } from "../editorConfig";
import { loadPlanTaskDetail } from "@/lib/platform/planSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function PlanTaskDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadPlanTaskDetail(ctx, id);
  return <RecordDetailPage orgSlug={ctx.orgSlug} config={config} values={values} recordId={id} />;
}
