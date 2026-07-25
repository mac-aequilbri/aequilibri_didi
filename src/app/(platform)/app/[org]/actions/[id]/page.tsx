// Single-action detail page (read-only). Reachable by clicking a row on the
// Action Hub; editing is the explicit Edit step ([id]/edit) — the same
// paradigm as every other register.

import RecordDetailPage from "../../_record-edit/RecordDetailPage";
import { actionEditorConfig as config, actionEditorValues } from "../editorConfig";
import { loadAction } from "@/lib/platform/actionsSource";
import { loadJobLabelMap } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function ActionDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const action = await loadAction(ctx, id);
  const values = actionEditorValues(action);
  // Linked project for the detail view's Project row (label resolved once,
  // from the TTL-cached job map — no extra Airtable read).
  if (values && action?.jobId) {
    values.jobId = action.jobId;
    values.jobName = (await loadJobLabelMap(ctx)).get(action.jobId) ?? "";
  }
  return <RecordDetailPage orgSlug={ctx.orgSlug} config={config} values={values} recordId={id} />;
}
