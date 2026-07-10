// Single-room edit page. Reachable by clicking a room on the Room Matrix.

import RecordEditPage from "../../_record-edit/RecordEditPage";
import { loadRoomDetail } from "@/lib/platform/domainListSources";
import { requireOrgCtx } from "@/lib/platform/org-context";
import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const dynamic = "force-dynamic";

const config: RecordEditorConfig = {
  table: "room",
  noun: "room",
  listPath: "/room-matrix",
  aiRole:
    "You are an operations assistant helping a construction manager keep a room/finishes matrix tidy — sensible zone groupings.",
  fields: [
    { name: "name", label: "Room name", type: "text", required: true },
    { name: "zone", label: "Zone", type: "text", aiFillable: true },
    { name: "areaSqm", label: "Area (m²)", type: "number", min: 0, step: 0.01 },
    { name: "ceilingHeight", label: "Ceiling height", type: "text" },
  ],
};

export default async function RoomDetailPage({
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
    />
  );
}
