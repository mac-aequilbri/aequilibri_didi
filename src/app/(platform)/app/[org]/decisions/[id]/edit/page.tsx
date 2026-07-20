// Single-decision edit page — the explicit Edit step from the decision detail
// view. Back/Cancel and post-save return to the detail page.

import RecordEditPage from "../../../_record-edit/RecordEditPage";
import { decisionEditorConfig as config } from "../../editorConfig";
import { loadDecisionDetail } from "@/lib/platform/decisionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function DecisionEditPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadDecisionDetail(ctx, id);
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
