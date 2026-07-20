// Print-ready report view (the doc's PDF generator, phase-1 form: an HTML
// print view behind the same data; a binary PDF generator can slot in later).

import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { OrgLogo } from "@/components/OrgLogo";
import { formatDate } from "@/lib/format";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { reportModeFor, reportingCapabilities } from "@/lib/platform/reportingPolicy";
import { loadReportDetail } from "@/lib/platform/reportDetailSource";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({
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
    <div className="mx-auto max-w-2xl p-10 print:p-0 bg-white">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="mb-8 border-b border-neutral-300 pb-4">
        <div className="flex items-center gap-2">
          <OrgLogo logo={ctx.config.branding?.logo} name={ctx.orgName} size={22} />
          <p className="text-xs uppercase tracking-widest text-neutral-400">{ctx.orgName}</p>
        </div>
        <h1 className="text-2xl font-bold mt-1">
          {report.title || `Weekly report — ${formatDate(report.weekEnding)}`}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {report.jobCode} — {report.jobName} · week ending {formatDate(report.weekEnding)}
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          {reportModeFor("weekly_report")} output · {reportCaps.audienceLabel}
        </p>
      </header>
      <main className="prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
      </main>
      <footer className="mt-10 border-t border-neutral-200 pt-3 text-xs text-neutral-400">
        {report.approvedBy ? `Approved by ${report.approvedBy}` : "Draft — not yet approved"} ·
        generated {formatDate(report.generatedAt)} · æquilibri
      </footer>
    </div>
  );
}
