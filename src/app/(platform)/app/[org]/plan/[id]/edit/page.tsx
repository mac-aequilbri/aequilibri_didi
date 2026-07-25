// Single plan task edit page — the explicit Edit step from the task detail
// view. Back/Cancel and post-save return to the detail page.

import RecordEditPage from "../../../_record-edit/RecordEditPage";
import { planEditorConfig as config } from "../../editorConfig";
import { loadPlanTaskDetail } from "@/lib/platform/planSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function PlanTaskEditPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadPlanTaskDetail(ctx, id);
  return (
    <RecordEditPage
      orgSlug={ctx.orgSlug}
      config={config}
      values={values}
      recordId={id}
      subtitle={values ? String(values.name) : undefined}
      returnPath={`${config.listPath}/${id}`}
    />
  );
}
