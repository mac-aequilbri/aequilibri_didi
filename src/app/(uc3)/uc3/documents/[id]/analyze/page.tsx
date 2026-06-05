import { notFound } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { getActiveTenant } from "@/lib/uc3-tenant";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { analyzeDocument } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

export default async function AnalyzeDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const docId = Number(id);

  const tenant = await getActiveTenant();
  if (!tenant) notFound();

  let doc: Awaited<ReturnType<typeof db.uc3Document.findFirst>> = null;

  try {
    doc = await db.uc3Document.findFirst({
      where: { id: docId, tenantId: tenant.id },
      include: { project: { select: { name: true } } },
    });
  } catch {
    // graceful empty state
  }

  if (!doc) notFound();

  const analyzeWithId = analyzeDocument.bind(null, docId);

  return (
    <div className="pb-16">
      <PageHeader
        title={doc.name}
        subtitle="Document analysis"
        actions={[{ href: "/uc3/documents", label: "Back to Documents", variant: "outline" }]}
      />

      <div className="px-8 space-y-6">
        {/* Metadata card */}
        <div className="ae-card p-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-4">
            Document Details
          </h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-neutral-500">Project</dt>
              <dd className="font-medium">
                {(doc as typeof doc & { project?: { name: string } | null })
                  .project?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Type</dt>
              <dd className="font-medium">{doc.docType ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Version</dt>
              <dd className="font-medium">{doc.version ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Uploaded By</dt>
              <dd className="font-medium">{doc.uploadedBy ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Upload Date</dt>
              <dd className="font-medium">
                {doc.uploadDate
                  ? new Date(doc.uploadDate).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">AI Analysis</dt>
              <dd>
                {doc.aiAnalysis ? (
                  <StatusBadge status="complete" />
                ) : (
                  <StatusBadge status="pending" />
                )}
              </dd>
            </div>
            {doc.notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-neutral-500">Notes</dt>
                <dd className="font-medium">{doc.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* File content */}
        {doc.fileContent && (
          <div className="ae-card p-6">
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">
              File Content
            </h2>
            <pre className="text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-md p-4 overflow-auto max-h-80 whitespace-pre-wrap break-words">
              {doc.fileContent}
            </pre>
          </div>
        )}

        {/* AI Analysis result */}
        {doc.aiAnalysis && (
          <div className="ae-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-neutral-700">
                AI Analysis
              </h2>
              {doc.analyzedAt && (
                <span className="text-xs text-neutral-400">
                  Generated {new Date(doc.analyzedAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="prose prose-sm max-w-none text-neutral-700 whitespace-pre-wrap">
              {doc.aiAnalysis}
            </div>
          </div>
        )}

        {/* Analyze button */}
        <div className="ae-card p-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-2">
            {doc.aiAnalysis ? "Re-analyse Document" : "Analyse Document"}
          </h2>
          <p className="text-sm text-neutral-500 mb-4">
            {doc.aiAnalysis
              ? "Run AI analysis again to refresh the results with the current file content."
              : "Run AI analysis on the file content to extract key information, risks, and action items."}
          </p>
          {!doc.fileContent && (
            <p className="text-sm text-amber-600 mb-4">
              No file content is stored for this document. Add content via the
              upload form before analysing.
            </p>
          )}
          {doc.fileContent && doc.fileContent.length > 4000 && (
            <p className="text-sm text-amber-600 mb-4">
              ⚠ This document is {doc.fileContent.length.toLocaleString()} characters.
              AI analysis only reads the first 4 000 characters — approximately the
              first {Math.round(4000 / (doc.fileContent.length / doc.fileContent.split("\n").length))} lines.
              Content beyond that point will not be analysed.
            </p>
          )}
          <form action={analyzeWithId}>
            <button
              type="submit"
              className="btn-ae"
              disabled={!doc.fileContent}
            >
              {doc.aiAnalysis ? "Re-analyse" : "Run AI Analysis"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
