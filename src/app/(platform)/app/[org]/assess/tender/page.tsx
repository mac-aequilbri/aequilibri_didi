import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/form/SubmitButton";
import { loadDocuments, loadDocumentDetail } from "@/lib/platform/documentsSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { runTenderComparisonAction } from "./actions";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Module 3 payload (builder_tender_comparison). The capability persists its
// structured payload as the JSON body of the generated snapshot document
// (documents.ts generateManagedDocument → textContent after the "---" rule),
// so we parse it from there; aiAnalysis.module3 is kept as a legacy fallback.
// ---------------------------------------------------------------------------

interface TenderRow {
  item: string;
  amount: number;
  provisional: boolean;
}

interface TenderBuilder {
  builder: string;
  sourceDocumentId: string;
  extraction: string;
  rows: TenderRow[];
  total: number;
  provisionalTotal: number;
  provisionalPct: number;
}

interface TenderResult {
  extractionMethod: string;
  aiDocuments: number;
  totalDocuments: number;
  builders: TenderBuilder[];
  gaps: { builder: string; missingItems: string[] }[];
  recommendation: { builder: string; reason: string } | null;
  risks: string[];
}

function parsePayload(textContent: string | null | undefined, aiAnalysis: string | null | undefined): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(aiAnalysis || "{}") as { module3?: unknown };
    if (raw.module3 && typeof raw.module3 === "object") return raw.module3 as Record<string, unknown>;
  } catch {
    /* fall through to textContent */
  }
  const text = textContent ?? "";
  const brace = text.indexOf("{");
  if (brace === -1) return null;
  try {
    const parsed = JSON.parse(text.slice(brace)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

function coerceTenderResult(raw: Record<string, unknown> | null): TenderResult | null {
  if (!raw) return null;
  const builders: TenderBuilder[] = Array.isArray(raw.builders)
    ? (raw.builders as unknown[]).map((b) => {
        const o = (b ?? {}) as Record<string, unknown>;
        const rows: TenderRow[] = Array.isArray(o.rows)
          ? (o.rows as unknown[]).map((r) => {
              const row = (r ?? {}) as Record<string, unknown>;
              return {
                item: String(row.item ?? "unspecified"),
                amount: num(row.amount),
                provisional: row.provisional === true,
              };
            })
          : [];
        return {
          builder: String(o.builder ?? "(unknown builder)"),
          sourceDocumentId: String(o.sourceDocumentId ?? ""),
          extraction: String(o.extraction ?? ""),
          rows,
          total: num(o.total),
          provisionalTotal: num(o.provisionalTotal),
          provisionalPct: num(o.provisionalPct),
        };
      })
    : [];
  if (builders.length === 0) return null;

  const extraction = (raw.extraction ?? {}) as Record<string, unknown>;
  const rec = raw.recommendation as Record<string, unknown> | null | undefined;
  return {
    extractionMethod: String(extraction.method ?? ""),
    aiDocuments: num(extraction.aiDocuments),
    totalDocuments: num(extraction.totalDocuments),
    builders,
    gaps: Array.isArray(raw.gaps)
      ? (raw.gaps as unknown[]).map((g) => {
          const o = (g ?? {}) as Record<string, unknown>;
          return { builder: String(o.builder ?? ""), missingItems: strArr(o.missingItems) };
        })
      : [],
    recommendation:
      rec && typeof rec === "object"
        ? { builder: String(rec.builder ?? ""), reason: String(rec.reason ?? "") }
        : null,
    risks: strArr(raw.risks),
  };
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function TenderComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ run?: string; error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { run, error } = await searchParams;
  const [jobs, docs, resultDoc] = await Promise.all([
    loadJobOptions(ctx),
    loadDocuments(ctx),
    run ? loadDocumentDetail(ctx, run) : Promise.resolve(null),
  ]);

  const tender = resultDoc
    ? coerceTenderResult(parsePayload(resultDoc.textContent, resultDoc.aiAnalysis))
    : null;

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <PageHeader
        title="Builder tender comparison"
        subtitle="Compares builder tenders against canonical trade-item scope."
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

        <div>
          <h2 className="font-semibold text-sm mb-1">Tender documents</h2>
          <p className="text-xs text-neutral-500 mb-2">
            Tick the tender documents to compare (one per builder).
          </p>
          {error === "no_docs" && (
            <p role="alert" className="mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              Select at least one document to run the comparison.
            </p>
          )}
          <div className="max-h-56 overflow-auto border border-neutral-100 rounded">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600 text-xs">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="text-left px-3 py-2">Title</th>
                  <th className="text-left px-3 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-t border-neutral-100">
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        name="docIds"
                        value={String(d.id)}
                        aria-label={`Select ${d.title}`}
                        className="h-4 w-4 align-middle accent-[var(--ae-space-deep)]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {d.title}
                      <span className="block font-mono text-[0.65rem] text-neutral-400">{String(d.id)}</span>
                    </td>
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
        </div>

        <SubmitButton label="Run tender comparison" pendingLabel="Analysing documents…" />
      </form>

      {resultDoc && (
        <section className="ae-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Latest comparison output</h2>
            <Link href={`/app/${ctx.orgSlug}/documents/${resultDoc.id}`} className="btn-ae-outline">
              Open generated document
            </Link>
          </div>
          <p className="text-sm text-neutral-700">{resultDoc.aiSummary || "Comparison generated."}</p>

          {!tender ? (
            <p role="status" className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              Analysis returned no results.
            </p>
          ) : (
            <>
              <p className="text-xs text-neutral-500">
                Extraction: {tender.extractionMethod || "unknown"}
                {tender.totalDocuments > 0 && ` · ${tender.aiDocuments}/${tender.totalDocuments} documents via AI`}
              </p>

              {tender.recommendation && (
                <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  <span className="font-semibold">Recommended: {tender.recommendation.builder}</span>
                  {tender.recommendation.reason && <span> — {tender.recommendation.reason}</span>}
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-1.5">Tender totals</h3>
                <div className="overflow-auto border border-neutral-100 rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-600 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Builder</th>
                        <th className="text-right px-3 py-2">Parsed total</th>
                        <th className="text-right px-3 py-2">Provisional</th>
                        <th className="text-right px-3 py-2">Line items</th>
                        <th className="text-left px-3 py-2">Extraction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tender.builders.map((b) => (
                        <tr key={`${b.builder}-${b.sourceDocumentId}`} className="border-t border-neutral-100">
                          <td className="px-3 py-2 font-medium">{b.builder}</td>
                          <td className="px-3 py-2 text-right">{money(b.total)}</td>
                          <td className="px-3 py-2 text-right">
                            {money(b.provisionalTotal)}
                            <span className="text-xs text-neutral-500"> ({b.provisionalPct}%)</span>
                          </td>
                          <td className="px-3 py-2 text-right">{b.rows.length}</td>
                          <td className="px-3 py-2 text-xs text-neutral-500">{b.extraction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {tender.builders.some((b) => b.rows.length > 0) && (
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold">Line items by builder</h3>
                  {tender.builders.map((b) => (
                    <details key={`rows-${b.builder}-${b.sourceDocumentId}`} className="border border-neutral-100 rounded">
                      <summary className="cursor-pointer px-3 py-2 text-sm text-neutral-700">
                        {b.builder} — {b.rows.length} item{b.rows.length === 1 ? "" : "s"}
                      </summary>
                      <table className="w-full text-sm border-t border-neutral-100">
                        <tbody>
                          {b.rows.map((r, i) => (
                            <tr key={i} className="border-t border-neutral-50 first:border-t-0">
                              <td className="px-3 py-1.5">{r.item}</td>
                              <td className="px-3 py-1.5 text-right whitespace-nowrap">{money(r.amount)}</td>
                              <td className="px-3 py-1.5 text-right text-xs text-amber-700 w-24">
                                {r.provisional ? "provisional" : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ))}
                </div>
              )}

              {tender.gaps.some((g) => g.missingItems.length > 0) && (
                <div>
                  <h3 className="text-sm font-semibold mb-1.5">Scope gaps</h3>
                  <ul className="space-y-1 text-sm text-neutral-700">
                    {tender.gaps
                      .filter((g) => g.missingItems.length > 0)
                      .map((g) => (
                        <li key={`gap-${g.builder}`}>
                          <span className="font-medium">{g.builder}</span> is missing:{" "}
                          <span className="text-neutral-600">{g.missingItems.join(", ")}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {tender.risks.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-1.5">Risks</h3>
                  <ul className="list-disc pl-5 space-y-0.5 text-sm text-amber-800">
                    {tender.risks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
