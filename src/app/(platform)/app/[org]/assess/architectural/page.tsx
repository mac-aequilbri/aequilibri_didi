import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/form/SubmitButton";
import { loadDocuments, loadDocumentDetail } from "@/lib/platform/documentsSource";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { runArchitecturalScopeAction } from "./actions";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Module 3 payload (architectural_scope_assessment). The capability persists
// its structured payload as the JSON body of the generated snapshot document
// (documents.ts generateManagedDocument → textContent after the "---" rule),
// so we parse it from there; aiAnalysis.module3 is kept as a legacy fallback.
// ---------------------------------------------------------------------------

interface RoomRow {
  room: string;
  areaSqm: number | null;
  impliedTrades: string[];
}

interface ScopeResult {
  extractionMethod: string;
  aiDocuments: number;
  totalDocuments: number;
  rooms: RoomRow[];
  createdRooms: number;
  missingAreaRooms: string[];
  followUpActionProposalId: string | null;
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

function coerceScopeResult(raw: Record<string, unknown> | null): ScopeResult | null {
  if (!raw) return null;
  const rooms: RoomRow[] = Array.isArray(raw.rooms)
    ? (raw.rooms as unknown[]).map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        const area = Number(o.areaSqm);
        return {
          room: String(o.room ?? "(unnamed room)"),
          areaSqm: Number.isFinite(area) && area > 0 ? area : null,
          impliedTrades: strArr(o.impliedTrades),
        };
      })
    : [];
  if (rooms.length === 0) return null;

  const extraction = (raw.extraction ?? {}) as Record<string, unknown>;
  return {
    extractionMethod: String(extraction.method ?? ""),
    aiDocuments: num(extraction.aiDocuments),
    totalDocuments: num(extraction.totalDocuments),
    rooms,
    createdRooms: num(raw.createdRooms),
    missingAreaRooms: strArr(raw.missingAreaRooms),
    followUpActionProposalId:
      raw.followUpActionProposalId == null ? null : String(raw.followUpActionProposalId),
  };
}

export default async function ArchitecturalScopePage({
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

  const scope = resultDoc
    ? coerceScopeResult(parsePayload(resultDoc.textContent, resultDoc.aiAnalysis))
    : null;

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <PageHeader
        title="Architectural scope assessment"
        subtitle="Parses architectural inputs into room-scope records and follow-up actions."
        actions={[{ href: `/app/${ctx.orgSlug}/assess`, label: "Back to assessment", variant: "outline" }]}
      />

      <form action={runArchitecturalScopeAction} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid sm:grid-cols-3 gap-4">
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
            <span className="text-neutral-600">Zone override</span>
            <input name="zone" defaultValue="Architectural" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Output title (optional)</span>
            <input name="title" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>

        <div>
          <h2 className="font-semibold text-sm mb-1">Architectural documents</h2>
          <p className="text-xs text-neutral-500 mb-2">
            Tick the documents to parse for room-by-room scope.
          </p>
          {error === "no_docs" && (
            <p role="alert" className="mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              Select at least one document to run the assessment.
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

        <SubmitButton label="Run architectural scope assessment" pendingLabel="Analysing documents…" />
      </form>

      {resultDoc && (
        <section className="ae-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Latest scope output</h2>
            <Link href={`/app/${ctx.orgSlug}/documents/${resultDoc.id}`} className="btn-ae-outline">
              Open generated document
            </Link>
          </div>
          <p className="text-sm text-neutral-700">{resultDoc.aiSummary || "Scope assessment generated."}</p>

          {!scope ? (
            <p role="status" className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              Analysis returned no results.
            </p>
          ) : (
            <>
              <p className="text-xs text-neutral-500">
                Extraction: {scope.extractionMethod || "unknown"}
                {scope.totalDocuments > 0 && ` · ${scope.aiDocuments}/${scope.totalDocuments} documents via AI`}
                {` · ${scope.createdRooms} room record${scope.createdRooms === 1 ? "" : "s"} created`}
              </p>

              <div>
                <h3 className="text-sm font-semibold mb-1.5">
                  Rooms recognised ({scope.rooms.length})
                </h3>
                <div className="overflow-auto border border-neutral-100 rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-600 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Room</th>
                        <th className="text-right px-3 py-2">Area (m²)</th>
                        <th className="text-left px-3 py-2">Implied trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scope.rooms.map((r, i) => (
                        <tr key={`${r.room}-${i}`} className="border-t border-neutral-100">
                          <td className="px-3 py-2 font-medium">{r.room}</td>
                          <td className="px-3 py-2 text-right">
                            {r.areaSqm != null ? (
                              r.areaSqm.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            ) : (
                              <span className="text-amber-700 text-xs">missing</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-600">
                            {r.impliedTrades.length > 0 ? r.impliedTrades.join(", ") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {scope.missingAreaRooms.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <span className="font-semibold">Missing dimensions:</span>{" "}
                  {scope.missingAreaRooms.join(", ")}
                  {scope.followUpActionProposalId && (
                    <span className="block text-xs mt-1">
                      A follow-up action to capture these dimensions was proposed —{" "}
                      <Link href={`/app/${ctx.orgSlug}/approvals`} className="underline">
                        review it in Approvals
                      </Link>
                      .
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
