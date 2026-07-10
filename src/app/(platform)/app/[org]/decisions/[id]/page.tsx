// Single-decision edit page. Reachable by clicking a row on the Decisions list.

import RecordEditPage from "../../_record-edit/RecordEditPage";
import { loadDecisionDetail } from "@/lib/platform/decisionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const dynamic = "force-dynamic";

const config: RecordEditorConfig = {
  table: "decision",
  noun: "decision",
  listPath: "/decisions",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager record a project decision clearly and traceably.",
  fields: [
    { name: "description", label: "Decision", type: "textarea", full: true, required: true, aiFillable: true },
    { name: "rationale", label: "Rationale", type: "textarea", full: true, aiFillable: true },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "proposed", label: "proposed" },
        { value: "confirmed", label: "confirmed" },
        { value: "superseded", label: "superseded" },
      ],
    },
    { name: "decidedAt", label: "Decided on", type: "date" },
  ],
};

export default async function DecisionDetailPage({
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
    />
  );
}
