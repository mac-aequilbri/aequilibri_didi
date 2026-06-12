// Document detail + AI analysis (read-only intelligence on the source).

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { analyzeDocumentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const doc = await prisma.platDocument.findFirst({
    where: { id: Number(id), orgId: ctx.orgId },
    include: { job: { select: { code: true, name: true } } },
  });
  if (!doc) notFound();

  let analysis: { risks?: string[]; obligations?: string[]; key_terms?: Record<string, string> } = {};
  try {
    analysis = JSON.parse(doc.aiAnalysis);
  } catch {
    /* none yet */
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title={doc.title}
        subtitle={`${doc.classification || doc.docType || "unclassified"} · ${doc.job?.code ?? "org-level"} · added ${formatDate(doc.createdAt)}${doc.uploadedBy ? ` by ${doc.uploadedBy}` : ""}`}
        actions={[{ href: orgPath(ctx.orgSlug, "/documents"), label: "All documents", variant: "outline" }]}
      />

      <div className="ae-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={doc.status} />
          {doc.confidence != null && (
            <span className="text-xs text-neutral-500">classification confidence {doc.confidence}%</span>
          )}
          {doc.analyzedAt && (
            <span className="text-xs text-neutral-500">analysed {formatDate(doc.analyzedAt)}</span>
          )}
        </div>

        {doc.storageProvider === "gdrive" && doc.storageRef && (
          <p className="text-sm">
            <a
              href={`https://drive.google.com/file/d/${encodeURIComponent(doc.storageRef)}/view`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline font-medium"
            >
              Open in Google Drive ↗
            </a>
          </p>
        )}

        {doc.aiSummary && (
          <p className="text-sm">
            <span className="font-semibold">Summary:</span> {doc.aiSummary}
          </p>
        )}

        {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
          <div className="text-sm">
            <span className="font-semibold">Risks</span>
            <ul className="list-disc ml-5 text-neutral-700">
              {analysis.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {Array.isArray(analysis.obligations) && analysis.obligations.length > 0 && (
          <div className="text-sm">
            <span className="font-semibold">Obligations</span>
            <ul className="list-disc ml-5 text-neutral-700">
              {analysis.obligations.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
        )}

        {doc.textContent ? (
          <form action={analyzeDocumentAction}>
            <input type="hidden" name="org" value={ctx.orgSlug} />
            <input type="hidden" name="recordId" value={doc.id} />
            <button type="submit" className="btn-ae">
              {doc.status === "analyzed" ? "Re-analyse with AI" : "Analyse with AI"}
            </button>
          </form>
        ) : (
          <p className="text-xs text-neutral-500">
            No extractable text in this document — analysis unavailable.
          </p>
        )}

        {doc.textContent && (
          <details className="text-xs text-neutral-500">
            <summary className="cursor-pointer">Extracted text ({doc.textContent.length} chars)</summary>
            <pre className="mt-2 whitespace-pre-wrap max-h-72 overflow-auto">{doc.textContent.slice(0, 8000)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
