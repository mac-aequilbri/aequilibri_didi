// Single-room detail page (read-only). Reachable by clicking a room on the
// Room Matrix; editing is an explicit step via the header's Edit action.

import RecordDetailPage from "../../_record-edit/RecordDetailPage";
import { roomEditorConfig as config } from "../editorConfig";
import { loadRoomDetail } from "@/lib/platform/domainListSources";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadRoomDetail(ctx, id);
  return <RecordDetailPage orgSlug={ctx.orgSlug} config={config} values={values} recordId={id} />;
}
