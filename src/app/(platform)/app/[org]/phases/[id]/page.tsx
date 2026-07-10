// Single-phase edit page. Reachable by clicking a phase on the Phases page.
// (Evidence upload / AI completion-% review stays on the list page.)

import RecordEditPage from "../../_record-edit/RecordEditPage";
import { loadPhaseDetail } from "@/lib/platform/phasesSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const dynamic = "force-dynamic";

const config: RecordEditorConfig = {
  table: "phase",
  noun: "phase",
  listPath: "/phases",
  aiRole:
    "You are an operations assistant helping a construction manager name project phases clearly and consistently.",
  fields: [
    { name: "name", label: "Phase name", type: "text", full: true, required: true, aiFillable: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "pending", label: "pending" },
        { value: "in_progress", label: "in progress" },
        { value: "complete", label: "complete" },
      ],
    },
    { name: "completionPct", label: "Completion %", type: "number", min: 0, max: 100 },
    { name: "sortOrder", label: "Sort order", type: "number", min: 0 },
  ],
};

export default async function PhaseDetailPage({
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
    />
  );
}
