// Single communication edit page — the explicit Edit step from the
// communication detail view. Back/Cancel and post-save return to the detail
// page.

import RecordEditPage from "../../../_record-edit/RecordEditPage";
import { commEditorConfig as config } from "../../editorConfig";
import { loadCommDetail } from "@/lib/platform/commsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function CommEditPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadCommDetail(ctx, id);
  return (
    <RecordEditPage
      orgSlug={ctx.orgSlug}
      config={config}
      values={values}
      recordId={id}
      subtitle={values ? String(values.topic) : undefined}
      returnPath={`${config.listPath}/${id}`}
    />
  );
}
