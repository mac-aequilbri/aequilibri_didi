// Report detail — markdown render, approve → send workflow, print view.

import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/form/ConfirmSubmitButton";
import { SubmitButton } from "@/components/form/SubmitButton";
import { formatDate } from "@/lib/format";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { reportModeFor, reportingCapabilities } from "@/lib/platform/reportingPolicy";
import { loadReportDetail } from "@/lib/platform/reportDetailSource";
import {
  approveReportAction,
  markSentAction,
  regenerateReportAction,
  saveTemplateAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const viewer = await getCurrentViewer(ctx);
  const reportCaps = reportingCapabilities(viewer.role);
  const report = await loadReportDetail(ctx, id);
  if (!report) notFound();

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title={report.title || `Week ending ${formatDate(report.weekEnding)}`}
        subtitle={`${report.jobCode} — ${report.jobName} · generated ${formatDate(report.generatedAt)} · ${reportModeFor("weekly_report")} output · ${reportCaps.audienceLabel}`}
        actions={[
          { href: orgPath(ctx.orgSlug, `/reports/${report.id}/print`), label: "Print view", variant: "outline" },
          { href: orgPath(ctx.orgSlug, "/reports"), label: "All reports", variant: "outline" },
        ]}
      />

      <div className="ae-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={report.status} />
          {report.approvedBy && (
            <span className="text-xs text-neutral-500">
              approved by {report.approvedBy}
              {report.approvedAt ? ` on ${formatDate(report.approvedAt)}` : ""}
            </span>
          )}
          {report.sentAt && (
            <span className="text-xs text-neutral-500">sent {formatDate(report.sentAt)}</span>
          )}
        </div>

        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
        </div>

        <div className="mt-6 flex gap-2 border-t border-neutral-100 pt-4">
          {report.status === "draft" && reportCaps.canGenerateReports && (
            <form action={approveReportAction}>
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="recordId" value={report.id} />
              <SubmitButton label="Approve report" pendingLabel="Approving…" />
            </form>
          )}
          {report.promptSpec && reportCaps.canGenerateReports && (
            <form action={regenerateReportAction}>
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="recordId" value={report.id} />
              <ConfirmSubmitButton
                label="Regenerate"
                confirmLabel={
                  report.status === "approved" || report.status === "sent"
                    ? `Confirm — replaces this ${report.status} report`
                    : "Confirm — replaces current content"
                }
                pendingLabel="Regenerating…"
                title="Re-runs the prompt against fresh data, overwrites the current content and returns the report to draft."
              />
            </form>
          )}
          {report.promptSpec && reportCaps.canGenerateReports && (
            <form action={saveTemplateAction} className="flex items-center gap-2">
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="recordId" value={report.id} />
              <input
                name="templateTitle"
                placeholder="Template name (optional)"
                className="w-44 rounded border border-neutral-300 px-2 py-1.5 text-xs"
              />
              <SubmitButton label="Save as template" pendingLabel="Saving…" />
            </form>
          )}
          {report.status === "approved" && reportCaps.canGenerateReports && (
            <form action={markSentAction}>
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="recordId" value={report.id} />
              <SubmitButton label="Mark as sent" pendingLabel="Marking…" />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
