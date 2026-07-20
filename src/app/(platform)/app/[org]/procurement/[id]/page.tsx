// Single procurement-order detail page (read-only). Reachable by clicking a
// row on the list; editing is an explicit step via the header's Edit action.

import RecordDetailPage from "../../_record-edit/RecordDetailPage";
import { procurementEditorConfig as config } from "../editorConfig";
import { loadProcurementDetail } from "@/lib/platform/procurementSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function ProcurementDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadProcurementDetail(ctx, id);
  return <RecordDetailPage orgSlug={ctx.orgSlug} config={config} values={values} recordId={id} />;
}
