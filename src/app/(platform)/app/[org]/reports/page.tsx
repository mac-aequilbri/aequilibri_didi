import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { SubmitButton } from "@/components/form/SubmitButton";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import {
  parseListQuery,
  sortAndPaginate,
  toClientConfig,
  type ListViewConfig,
} from "@/lib/platform/listQuery";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { loadWeeklyReports, type ReportView } from "@/lib/platform/domainListSources";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { orgPath } from "@/lib/platform/paths";
import { ALL_SCOPES, FINANCE_SCOPES, REPORT_CATALOG } from "@/lib/platform/reportCatalog";
import { reportModeFor, reportingCapabilities } from "@/lib/platform/reportingPolicy";
import { generateCustomReportAction, generateReportAction } from "./actions";

export const dynamic = "force-dynamic";

// Sort + pager config — reports accumulate weekly per job, so the table grows
// without bound. Filters can be added here later.
const reportsListConfig: ListViewConfig<ReportView> = {
  fields: [],
  sort: [
    {
      name: "week",
      label: "Week ending",
      getValue: (r) =>
        r.weekEnding ? (r.weekEnding instanceof Date ? r.weekEnding : new Date(r.weekEnding)) : null,
    },
    {
      name: "generated",
      label: "Generated",
      getValue: (r) =>
        r.generatedAt
          ? r.generatedAt instanceof Date
            ? r.generatedAt
            : new Date(r.generatedAt)
          : null,
    },
    { name: "title", label: "Title", getValue: (r) => r.title.toLowerCase() },
    { name: "status", label: "Status", getValue: (r) => r.status.toLowerCase() },
  ],
  pageSize: 50,
};

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const sp = await searchParams;
  const query = parseListQuery(sp, reportsListConfig);
  const viewer = await getCurrentViewer(ctx);
  const reportCaps = reportingCapabilities(viewer.role);
  const { listReportTemplates } = await import("@/lib/airtable/control");
  const [allReports, jobs, templates] = await Promise.all([
    loadWeeklyReports(ctx),
    loadJobOptions(ctx), // jobs feed the AI-generate dropdown
    listReportTemplates(ctx.orgSlug), // saved templates (Phase 4)
  ]);
  const { items: reports, page, pageCount } = sortAndPaginate(allReports, query, reportsListConfig);

  return (
    <div className="p-6">
      <PageHeader
        title="Weekly Reports"
        subtitle={`AI drafts from live project data; you approve before anything is sent. ${reportModeFor("weekly_report")} output · ${reportCaps.audienceLabel}.`}
      />

      {reportCaps.canGenerateReports ? (
        <form action={generateReportAction} className="ae-card p-5 mb-6 flex flex-wrap items-end gap-4">
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <label className="block text-sm">
            <span className="text-neutral-600">Report</span>
            <select name="reportId" className="mt-1 block rounded border border-neutral-300 px-3 py-2">
              {REPORT_CATALOG.filter((d) => !d.financeOnly || reportCaps.showFinancialDetail).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
              {templates.length > 0 && (
                <optgroup label="Saved templates">
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Job</span>
            <select name="jobId" className="mt-1 block rounded border border-neutral-300 px-3 py-2">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Period ending</span>
            <input type="date" name="weekEnding" className="mt-1 block rounded border border-neutral-300 px-3 py-2" />
          </label>
          <SubmitButton label="Generate with AI" pendingLabel="Generating report…" />
        </form>
      ) : null}

      {reportCaps.canGenerateReports ? (
        <form action={generateCustomReportAction} className="ae-card p-5 mb-6">
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <div className="text-sm font-medium mb-2">Custom report — describe what you want</div>
          <textarea
            name="prompt"
            required
            rows={2}
            placeholder="e.g. Compare spend against budget for the fit-out phase, flag anything more than 10% over, and list the variations that caused it"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="block text-sm">
              <span className="text-neutral-600">Job</span>
              <select name="jobId" className="mt-1 block rounded border border-neutral-300 px-3 py-2">
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">As at</span>
              <input type="date" name="weekEnding" className="mt-1 block rounded border border-neutral-300 px-3 py-2" />
            </label>
            <div className="flex flex-wrap gap-3 text-sm pb-2">
              {ALL_SCOPES.filter(
                (s) => reportCaps.showFinancialDetail || !FINANCE_SCOPES.includes(s),
              ).map((s) => (
                <label key={s} className="flex items-center gap-1 text-neutral-600">
                  <input type="checkbox" name="scopes" value={s} defaultChecked /> {s}
                </label>
              ))}
            </div>
            <SubmitButton label="Build with AI" pendingLabel="Building report…" />
          </div>
        </form>
      ) : (
        <div className="ae-card p-5 mb-6 text-sm text-neutral-600">
          This audience can view snapshot reports but cannot generate or approve them.
        </div>
      )}

      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/reports")}
        config={toClientConfig(reportsListConfig)}
        query={query}
        shown={allReports.length}
        total={allReports.length}
        page={page}
        pageCount={pageCount}
      >
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Report</th>
              <th className="py-1 pr-2">Week ending</th>
              <th className="py-1 pr-2">Generated</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="py-2 pr-2">
                  <Link href={orgPath(ctx.orgSlug, `/reports/${r.id}`)} className="font-medium hover:underline">
                    {r.title || `Week ending ${formatDate(r.weekEnding)}`}
                  </Link>
                  <span className="ml-1 text-xs text-neutral-400">{r.jobCode}</span>
                  {r.isAiGenerated && (
                    <span className="ml-1 text-[0.65rem] px-1 rounded bg-violet-100 text-violet-700">AI</span>
                  )}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDate(r.weekEnding)}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDate(r.generatedAt)}</td>
                <td className="py-2">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={4}>
                  No reports yet — generate one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </FilterBar>
    </div>
  );
}
