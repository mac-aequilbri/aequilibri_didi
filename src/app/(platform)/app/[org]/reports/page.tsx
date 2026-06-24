import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { loadWeeklyReports } from "@/lib/platform/domainListSources";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { orgPath } from "@/lib/platform/paths";
import { reportModeFor, reportingCapabilities } from "@/lib/platform/reportingPolicy";
import { generateReportAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const viewer = await getCurrentViewer(ctx);
  const reportCaps = reportingCapabilities(viewer.role);
  const [reports, jobs] = await Promise.all([
    loadWeeklyReports(ctx),
    loadJobOptions(ctx), // jobs feed the AI-generate dropdown
  ]);

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
            <span className="text-neutral-600">Week ending</span>
            <input type="date" name="weekEnding" className="mt-1 block rounded border border-neutral-300 px-3 py-2" />
          </label>
          <button type="submit" className="btn-ae">
            Generate with AI
          </button>
        </form>
      ) : (
        <div className="ae-card p-5 mb-6 text-sm text-neutral-600">
          This audience can view snapshot reports but cannot generate or approve them.
        </div>
      )}

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
    </div>
  );
}
