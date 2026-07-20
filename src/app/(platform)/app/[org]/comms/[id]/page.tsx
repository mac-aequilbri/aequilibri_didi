// Single communication detail page (read-only). Reachable by clicking a row on
// the Coordination Schedule; editing is an explicit step via the header's Edit
// action.

import RecordDetailPage from "../../_record-edit/RecordDetailPage";
import { commEditorConfig as config } from "../editorConfig";
import { loadCommDetail } from "@/lib/platform/commsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function CommDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadCommDetail(ctx, id);
  return <RecordDetailPage orgSlug={ctx.orgSlug} config={config} values={values} recordId={id} />;
}
