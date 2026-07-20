// Shared read-only detail view for a single record — the viewing half of
// RecordEditPage. Renders the SAME RecordEditorConfig as a label→value card
// (no live form fields), with an explicit "Edit" header action that leads to
// ‹window›/[id]/edit. Clicking a list row lands here first, mirroring the
// projects detail → edit pattern.

import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { localizeEditorConfig } from "@/lib/platform/domainLabels";
import { getOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import type { EditorField, EditorValues, RecordEditorConfig } from "@/lib/platform/recordEditor";

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Read-only rendering of one field value, per type:
 *  checkbox → Yes/No · date → "30 May 2026" · select → its option label ·
 *  anything empty → "—". */
function displayValue(field: EditorField, value: string | number | boolean | undefined): string {
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (value === undefined || value === "") return "—";
  if (field.type === "date") return formatDate(String(value));
  if (field.type === "select") {
    const v = String(value);
    return field.options?.find((o) => o.value === v)?.label ?? v;
  }
  return String(value);
}

export default async function RecordDetailPage({
  orgSlug,
  config: rawConfig,
  values,
  recordId,
}: {
  orgSlug: string;
  config: RecordEditorConfig;
  values: EditorValues | null;
  recordId: string;
}) {
  // Same per-vertical label overlay the edit page applies, so the two views
  // never disagree on field names.
  const ctx = await getOrgCtx(orgSlug);
  const config = ctx ? await localizeEditorConfig(ctx, rawConfig) : rawConfig;
  const listHref = orgPath(orgSlug, config.listPath);
  const backAction = { href: listHref, label: "← Back", variant: "outline" as const };

  if (!values) {
    return (
      <div className="p-6 max-w-xl">
        <PageHeader title={cap(config.noun)} actions={[backAction]} />
        <div className="ae-card p-5">
          <EmptyState
            title={`${cap(config.noun)} not found`}
            hint="It may have been removed, or the link is out of date."
            action={{ href: listHref, label: "Back to list" }}
          />
        </div>
      </div>
    );
  }

  // Title = the record's primary (first) field value; noun as fallback.
  const primary = String(values[config.fields[0]?.name] ?? "").trim();

  // Linked project — rendered only when the loader ALREADY resolved it into the
  // values (jobId/jobName keys); never triggers an extra read.
  const jobId = typeof values.jobId === "string" || typeof values.jobId === "number" ? String(values.jobId) : "";
  const jobName = typeof values.jobName === "string" ? values.jobName.trim() : "";

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={primary || cap(config.noun)}
        subtitle={cap(config.noun)}
        actions={[
          { href: orgPath(orgSlug, `${config.listPath}/${recordId}/edit`), label: "Edit" },
          backAction,
        ]}
      />
      <dl className="ae-card p-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {jobName && (
          <div className="sm:col-span-2">
            <dt className="text-sm text-neutral-600">Project</dt>
            <dd className="mt-1 text-sm font-medium">
              {jobId ? (
                <Link href={orgPath(orgSlug, `/projects/${jobId}`)} className="hover:underline">
                  {jobName}
                </Link>
              ) : (
                jobName
              )}
            </dd>
          </div>
        )}
        {config.fields.map((f) => (
          <div key={f.name} className={f.full ? "sm:col-span-2" : ""}>
            <dt className="text-sm text-neutral-600">{f.label}</dt>
            <dd className={`mt-1 text-sm${f.type === "textarea" ? " whitespace-pre-wrap" : ""}`}>
              {displayValue(f, values[f.name])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
