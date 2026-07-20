// Single-decision detail page (read-only). Reachable by clicking a row on the
// Decisions list; editing is an explicit step via the header's Edit action.

import RecordDetailPage from "../../_record-edit/RecordDetailPage";
import { decisionEditorConfig as config } from "../editorConfig";
import { loadDecisionDetail } from "@/lib/platform/decisionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function DecisionDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadDecisionDetail(ctx, id);
  return <RecordDetailPage orgSlug={ctx.orgSlug} config={config} values={values} recordId={id} />;
}
