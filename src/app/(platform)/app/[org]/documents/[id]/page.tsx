// Document detail + AI analysis (read-only intelligence on the source).

import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { loadDocumentDetail } from "@/lib/platform/documentsSource";
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
  const doc = await loadDocumentDetail(ctx, id);
  if (!doc) notFound();

  let analysis: { risks?: string[]; obligations?: string[]; key_terms?: Record<string, string> } = {};
  try {
    const parsed = JSON.parse(doc.aiAnalysis) as Record<string, unknown>;
    analysis = ((parsed.document_intelligence ?? parsed) as typeof analysis) || {};
  } catch {
    /* none yet */
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title={doc.title}
        subtitle={`${doc.classification || doc.docType || "unclassified"} · ${doc.jobCode ?? "org-level"} · v${doc.version} · added ${formatDate(doc.createdAt)}${doc.uploadedBy ? ` by ${doc.uploadedBy}` : ""}`}
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

        {(doc.storageProvider === "gdrive" || doc.storageProvider === "external") && doc.storageRef && (
          <p className="text-sm">
            <a
              href={
                doc.storageProvider === "gdrive"
                  ? `https://drive.google.com/file/d/${encodeURIComponent(doc.storageRef)}/view`
                  : doc.storageRef
              }
              target="_blank"
              rel="noreferrer"
              className="hover:underline font-medium"
            >
              {doc.storageProvider === "gdrive" ? "Open in Google Drive" : "Open source link"} ↗
            </a>
          </p>
        )}

        <div className="text-xs text-neutral-500">
          Lineage key <span className="font-mono">{doc.lineageKey}</span>
        </div>
        {doc.immutableSnapshot && (
          <p className="text-xs text-neutral-500">
            Module 4 snapshot · immutable
            {doc.outputType ? ` · ${doc.outputType.replace(/_/g, " ")}` : ""}
          </p>
        )}

        {doc.routeSuggestions.length > 0 && (
          <div className="text-sm">
            <span className="font-semibold">Module 2 routing</span>
            <ul className="list-disc ml-5 text-neutral-700">
              {doc.routeSuggestions.map((s, i) => (
                <li key={`${s.table}-${i}`}>
                  {s.summary}
                  {s.proposalId != null ? ` (proposal ${s.proposalId})` : ""}
                </li>
              ))}
            </ul>
          </div>
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

        {doc.textContent && !doc.immutableSnapshot ? (
          <form action={analyzeDocumentAction}>
            <input type="hidden" name="org" value={ctx.orgSlug} />
            <input type="hidden" name="recordId" value={doc.id} />
            <button type="submit" className="btn-ae">
              {doc.status === "analyzed" ? "Re-analyse with AI" : "Analyse with AI"}
            </button>
          </form>
        ) : doc.textContent ? (
          <p className="text-xs text-neutral-500">
            Snapshot documents are immutable — analysis is disabled.
          </p>
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
