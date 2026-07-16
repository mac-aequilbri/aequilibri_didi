// Shared server shell for a single-record edit page. Each window's
// ‹window›/[id]/page.tsx loads its record, then renders this with the record's
// config + form-ready values — mirroring actions/[id]/page.tsx once, not nine
// times.

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { localizeEditorConfig } from "@/lib/platform/domainLabels";
import { getOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import type { EditorValues, RecordEditorConfig } from "@/lib/platform/recordEditor";
import RecordEditor from "./RecordEditor";

export default async function RecordEditPage({
  orgSlug,
  config: rawConfig,
  values,
  recordId,
  subtitle,
}: {
  orgSlug: string;
  config: RecordEditorConfig;
  values: EditorValues | null;
  recordId: string;
  /** Short label under the header (e.g. the record's title). */
  subtitle?: string;
}) {
  // Governance §4: overlay per-vertical DOMAIN_LABELS onto the field labels —
  // one hook localizes every record-edit window; no-op until labels exist.
  const ctx = await getOrgCtx(orgSlug);
  const config = ctx ? await localizeEditorConfig(ctx, rawConfig) : rawConfig;
  const backHref = orgPath(orgSlug, config.listPath);
  const backAction = { href: backHref, label: `← Back`, variant: "outline" as const };

  if (!values) {
    return (
      <div className="p-6 max-w-xl">
        <PageHeader title={`Edit ${config.noun}`} actions={[backAction]} />
        <div className="ae-card p-5">
          <EmptyState
            title={`${config.noun[0].toUpperCase()}${config.noun.slice(1)} not found`}
            hint="It may have been removed, or the link is out of date."
            action={{ href: backHref, label: "Back to list" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title={`Edit ${config.noun}`} subtitle={subtitle} actions={[backAction]} />
      <RecordEditor orgSlug={orgSlug} config={config} values={values} recordId={recordId} backHref={backHref} />
    </div>
  );
}
