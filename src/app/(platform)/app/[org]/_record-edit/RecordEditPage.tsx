// Shared server shell for a single-record edit page. Each window's
// ‹window›/[id]/page.tsx loads its record, then renders this with the record's
// config + form-ready values — mirroring actions/[id]/page.tsx once, not nine
// times.

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { localizeEditorConfig } from "@/lib/platform/domainLabels";
import { loadJobLabelMap, loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { getOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import type { EditorValues, RecordEditorConfig } from "@/lib/platform/recordEditor";
import { readRecord } from "@/lib/platform/recordWriter";
import RecordEditor from "./RecordEditor";

/** Current job of a raw record — Airtable "Job" link array or Postgres jobId. */
function jobOf(rec: Record<string, unknown>): string | null {
  const link = rec["Job"];
  if (Array.isArray(link) && link.length > 0) return String(link[0]);
  return rec["jobId"] != null ? String(rec["jobId"]) : null;
}

export default async function RecordEditPage({
  orgSlug,
  config: rawConfig,
  values,
  recordId,
  subtitle,
  returnPath,
}: {
  orgSlug: string;
  config: RecordEditorConfig;
  values: EditorValues | null;
  recordId: string;
  /** Short label under the header (e.g. the record's title). */
  subtitle?: string;
  /** Org-relative path Back/Cancel and post-save navigation return to.
   *  Defaults to the list; registers with a read-only detail view pass their
   *  detail path ("/risks/rec123"). Revalidation still targets the list. */
  returnPath?: string;
}) {
  // Governance §4: overlay per-vertical DOMAIN_LABELS onto the field labels —
  // one hook localizes every record-edit window; no-op until labels exist.
  const ctx = await getOrgCtx(orgSlug);
  let config = ctx ? await localizeEditorConfig(ctx, rawConfig) : rawConfig;
  let editorValues = values;

  // Append a "Project" (job) picker for job-scoped records so the job can be
  // set or corrected on edit — it drives RLS. Options + the record's current
  // job are resolved here, so no per-window detail loader needs to change. The
  // current job is always kept as an option (even beyond the picker's cap) so a
  // large-org edit can't silently clear it on save.
  if (ctx && values && rawConfig.jobScoped) {
    const [opts, labels, rec] = await Promise.all([
      loadJobOptions(ctx),
      loadJobLabelMap(ctx),
      readRecord(ctx, config.table, recordId),
    ]);
    const current = rec ? jobOf(rec) : null;
    const options = [
      { value: "", label: "— none —" },
      ...opts.map((o) => ({ value: o.id, label: o.label })),
    ];
    if (current && !opts.some((o) => o.id === current)) {
      options.push({ value: current, label: labels.get(current) ?? "(current project)" });
    }
    config = {
      ...config,
      fields: [
        ...config.fields,
        {
          name: "jobId",
          label: "Project",
          type: "select",
          full: true,
          options,
          help: "Which project this record belongs to — controls who can see it when project access is enforced.",
        },
      ],
    };
    editorValues = { ...values, jobId: current ?? "" };
  }

  const listHref = orgPath(orgSlug, config.listPath);
  const backHref = orgPath(orgSlug, returnPath ?? config.listPath);
  const backAction = { href: backHref, label: `← Back`, variant: "outline" as const };

  if (!values) {
    return (
      <div className="p-6 max-w-xl">
        <PageHeader title={`Edit ${config.noun}`} actions={[backAction]} />
        <div className="ae-card p-5">
          <EmptyState
            title={`${config.noun[0].toUpperCase()}${config.noun.slice(1)} not found`}
            hint="It may have been removed, or the link is out of date."
            action={{ href: listHref, label: "Back to list" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title={`Edit ${config.noun}`} subtitle={subtitle} actions={[backAction]} />
      <RecordEditor orgSlug={orgSlug} config={config} values={editorValues ?? values} recordId={recordId} backHref={backHref} />
    </div>
  );
}
