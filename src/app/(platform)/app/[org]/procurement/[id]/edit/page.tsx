// Single procurement-order edit page — the explicit Edit step from the order
// detail view. Back/Cancel and post-save return to the detail page.

import RecordEditPage from "../../../_record-edit/RecordEditPage";
import { procurementEditorConfig as config } from "../../editorConfig";
import { loadProcurementDetail } from "@/lib/platform/procurementSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function ProcurementEditPage({
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
      returnPath={`${config.listPath}/${id}`}
    />
  );
}
