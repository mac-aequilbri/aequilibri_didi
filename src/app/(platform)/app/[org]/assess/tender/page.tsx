import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/form/SubmitButton";
import { loadDocuments, loadDocumentDetail } from "@/lib/platform/documentsSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { runTenderComparisonAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TenderComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { run } = await searchParams;
  const [jobs, docs, resultDoc] = await Promise.all([
    loadJobOptions(ctx),
    loadDocuments(ctx),
    run ? loadDocumentDetail(ctx, run) : Promise.resolve(null),
  ]);

  const module3Result = resultDoc
    ? (() => {
        try {
          const raw = JSON.parse(resultDoc.aiAnalysis) as { module3?: Record<string, unknown> };
          return raw.module3 ?? null;
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <PageHeader
        title="Builder tender comparison"
        subtitle="Module 3 capability: compares builder tenders against canonical trade-item scope."
        actions={[{ href: `/app/${ctx.orgSlug}/assess`, label: "Back to assessment", variant: "outline" }]}
      />

      <form action={runTenderComparisonAction} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job</span>
            <select name="jobId" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" required>
              <option value="">Select job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Output title (optional)</span>
            <input name="title" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Document IDs (comma or newline separated)</span>
          <textarea
            name="documentIds"
            rows={4}
            required
            placeholder="recXXXX, recYYYY"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <SubmitButton label="Run tender comparison" pendingLabel="Analysing documents…" />
      </form>

      <section className="ae-card p-5">
        <h2 className="font-semibold mb-2">Available documents</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Copy IDs from this list into the input above.
        </p>
        <div className="max-h-56 overflow-auto border border-neutral-100 rounded">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-xs">
              <tr>
                <th className="text-left px-3 py-2">ID</th>
                <th className="text-left px-3 py-2">Title</th>
                <th className="text-left px-3 py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-mono text-xs">{d.id}</td>
                  <td className="px-3 py-2">{d.title}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{d.docType || d.classification}</td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-neutral-500">
                    No documents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {resultDoc && (
        <section className="ae-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Latest comparison output</h2>
            <Link href={`/app/${ctx.orgSlug}/documents/${resultDoc.id}`} className="btn-ae-outline">
              Open generated document
            </Link>
          </div>
          <p className="text-sm text-neutral-700">{resultDoc.aiSummary || "Comparison generated."}</p>
          {module3Result && (
            <pre className="text-xs bg-neutral-50 border border-neutral-100 rounded p-3 overflow-auto">
              {JSON.stringify(module3Result, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
