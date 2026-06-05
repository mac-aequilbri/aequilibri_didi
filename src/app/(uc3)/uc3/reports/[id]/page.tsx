import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { approveWeeklyReport, markWeeklyReportSent } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reportId = Number(id);

  type ReportWithProject = {
    id: number;
    title: string;
    weekEnding: Date;
    content: string;
    status: string;
    isAiGenerated: boolean;
    generatedAt: Date | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    project?: { name: string; client: string } | null;
  };
  let report: ReportWithProject | null = null;

  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;
    let tenantId: number | null = val ? Number(val) : null;
    if (!tenantId) {
      const fallback = await db.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }
    if (tenantId) {
      report = await db.uc3WeeklyReport.findFirst({
        where: { id: reportId, tenantId },
        include: { project: { select: { name: true, client: true } } },
      }) as ReportWithProject | null;
    }
  } catch {
    // graceful empty state
  }

  if (!report) notFound();

  const isDraft = report.status === "draft";
  const isApproved = report.status === "approved";

  return (
    <div className="pb-16">
      <PageHeader
        title={report.title}
        subtitle={`Week ending ${formatDate(report.weekEnding)}`}
        actions={[{ href: "/uc3/reports", label: "← Back to Reports" }]}
      />

      <div className="px-8 space-y-6 max-w-3xl">
        {/* Meta card */}
        <div className="ae-card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Project</p>
            <p className="font-medium">{report.project?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Client</p>
            <p className="font-medium">{report.project?.client ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Status</p>
            <StatusBadge status={report.status} />
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Source</p>
            {report.isAiGenerated ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                ✦ AI Generated
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600">
                Manual
              </span>
            )}
          </div>
          {report.generatedAt && (
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Generated At</p>
              <p className="font-medium">{formatDate(report.generatedAt)}</p>
            </div>
          )}
          {report.approvedBy && (
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Approved By</p>
              <p className="font-medium">{report.approvedBy}</p>
            </div>
          )}
          {report.approvedAt && (
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Approved At</p>
              <p className="font-medium">{formatDate(report.approvedAt)}</p>
            </div>
          )}
        </div>

        {/* Report content */}
        <div className="ae-card p-5">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">Report Content</h2>
          <pre className="whitespace-pre-wrap text-sm text-neutral-800 font-mono leading-relaxed overflow-auto max-h-[60vh] bg-neutral-50 rounded-lg p-4 border border-neutral-200">
            {report.content}
          </pre>
        </div>

        {/* Actions based on status */}
        {isDraft && (
          <div className="ae-card p-5">
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">Approve Report</h2>
            <p className="text-sm text-neutral-500 mb-4">
              Review the content above, then approve to mark it ready for distribution.
            </p>
            <form action={approveWeeklyReport} className="flex gap-3 items-end flex-wrap">
              <input type="hidden" name="reportId" value={report.id} />
              <div>
                <label htmlFor="approvedBy" className="block text-sm font-medium text-neutral-700 mb-1">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="approvedBy"
                  name="approvedBy"
                  type="text"
                  required
                  placeholder="e.g. Jane Smith"
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="submit" className="btn-ae">
                Approve Report
              </button>
            </form>
          </div>
        )}

        {isApproved && (
          <div className="ae-card p-5">
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">Mark as Sent</h2>
            <p className="text-sm text-neutral-500 mb-4">
              Once you have distributed this report to stakeholders, mark it as sent.
            </p>
            <form action={markWeeklyReportSent}>
              <input type="hidden" name="reportId" value={report.id} />
              <button type="submit" className="btn-ae">
                Mark as Sent
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
