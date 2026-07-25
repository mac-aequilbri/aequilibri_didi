// Single-action edit page — the explicit Edit step from the action detail
// view. Back/Cancel and post-save return to the detail page.

import RecordEditPage from "../../../_record-edit/RecordEditPage";
import { actionEditorConfig as config, actionEditorValues } from "../../editorConfig";
import { loadAction } from "@/lib/platform/actionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function ActionEditPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const action = await loadAction(ctx, id);
  return (
    <RecordEditPage
      orgSlug={ctx.orgSlug}
      config={config}
      values={actionEditorValues(action)}
      recordId={id}
      subtitle={action?.title}
      returnPath={`${config.listPath}/${id}`}
    />
  );
}
