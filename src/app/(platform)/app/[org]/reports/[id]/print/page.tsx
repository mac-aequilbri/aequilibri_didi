// Print-ready report view (the doc's PDF generator, phase-1 form: an HTML
// print view behind the same data; a binary PDF generator can slot in later).

import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({
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
    <div className="mx-auto max-w-2xl p-10 print:p-0 bg-white">
      <header className="mb-8 border-b border-neutral-300 pb-4">
        <p className="text-xs uppercase tracking-widest text-neutral-400">{ctx.orgName}</p>
        <h1 className="text-2xl font-bold mt-1">
          {report.title || `Weekly report — ${formatDate(report.weekEnding)}`}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {report.job?.code} — {report.job?.name} · week ending {formatDate(report.weekEnding)}
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
