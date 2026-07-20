// Single-room edit page — the explicit Edit step from the room detail view.
// Back/Cancel and post-save return to the detail page.

import RecordEditPage from "../../../_record-edit/RecordEditPage";
import { roomEditorConfig as config } from "../../editorConfig";
import { loadRoomDetail } from "@/lib/platform/domainListSources";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function RoomEditPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadRoomDetail(ctx, id);
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
