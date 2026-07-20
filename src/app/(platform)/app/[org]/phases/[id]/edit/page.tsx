// Single-phase edit page — the explicit Edit step from the phase detail view.
// Back/Cancel and post-save return to the detail page. (Evidence upload / AI
// completion-% review stays on the list page.)

import RecordEditPage from "../../../_record-edit/RecordEditPage";
import { phaseEditorConfig as config } from "../../editorConfig";
import { loadPhaseDetail } from "@/lib/platform/phasesSource";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function PhaseEditPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadPhaseDetail(ctx, id);
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
