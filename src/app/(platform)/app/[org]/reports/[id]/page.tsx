// Report detail — markdown render, approve → send workflow, print view.

import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { approveReportAction, markSentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const report = await prisma.platConWeeklyReport.findFirst({
    where: { id: Number(id), orgId: ctx.orgId },
    include: { job: { select: { code: true, name: true } } },
  });
  if (!report) notFound();

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title={report.title || `Week ending ${formatDate(report.weekEnding)}`}
        subtitle={`${report.job?.code} — ${report.job?.name} · generated ${formatDate(report.generatedAt)}`}
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
          {report.status === "draft" && (
            <form action={approveReportAction}>
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="recordId" value={report.id} />
              <button type="submit" className="btn-ae">
                Approve report
              </button>
            </form>
          )}
          {report.status === "approved" && (
            <form action={markSentAction}>
              <input type="hidden" name="org" value={ctx.orgSlug} />
              <input type="hidden" name="recordId" value={report.id} />
              <button type="submit" className="btn-ae">
                Mark as sent
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
