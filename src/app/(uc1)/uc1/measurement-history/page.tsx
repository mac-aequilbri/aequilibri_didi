import Link from "next/link";
import { currency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import {
  loadUc1MeasurementHistory,
  type Uc1MeasurementSnapshotView,
  type Uc1QuoteSnapshotView,
} from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

export default async function MeasurementHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();

  let snapshots: Uc1MeasurementSnapshotView[] = [];
  let quoteSnapshots: Uc1QuoteSnapshotView[] = [];
  try {
    ({ snapshots, quoteSnapshots } = await loadUc1MeasurementHistory(query));
  } catch {
    // graceful empty state (tables may be absent in dev)
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Measurement History"
        subtitle="Captured roof measurements and quote-generation snapshots"
      />

      <div className="px-8 space-y-6">
        <form className="flex items-center gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by address…"
            className="ae-input max-w-md"
          />
          <button type="submit" className="btn-ae-outline text-sm">Search</button>
          {query && <Link href="/uc1/measurement-history" className="text-sm text-neutral-500 hover:underline">Clear</Link>}
        </form>

        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]"><h6 className="font-bold">Measurement Snapshots</h6></div>
          <table className="ae-table">
            <thead>
              <tr><th>Address</th><th className="text-right">Area m²</th><th className="text-right">Sections</th><th className="text-right">Storeys</th><th>Type</th><th>Quote</th><th>Captured</th></tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-neutral-500">No measurement snapshots.</td></tr>
              ) : (
                snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="max-w-xs truncate">{s.address || "—"}</td>
                    <td className="text-right">{Math.round(s.totalAreaM2)}</td>
                    <td className="text-right">{s.sectionCount}</td>
                    <td className="text-right">{s.storeys}</td>
                    <td>{s.snapshotType.replace(/_/g, " ")}</td>
                    <td>{s.quote ? <Link href={`/uc1/quotes/${s.quote.id}`} className="text-blue-600 hover:underline">{s.quote.refNumber}</Link> : "—"}</td>
                    <td>{formatDate(s.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]"><h6 className="font-bold">Quote Snapshots</h6></div>
          <table className="ae-table">
            <thead>
              <tr><th>Address</th><th>Roof Type</th><th className="text-right">Total inc GST</th><th>Quote</th><th>Captured</th></tr>
            </thead>
            <tbody>
              {quoteSnapshots.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-neutral-500">No quote snapshots.</td></tr>
              ) : (
                quoteSnapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="max-w-xs truncate">{s.address || "—"}</td>
                    <td>{s.roofType || "—"}</td>
                    <td className="text-right">{currency(s.totalIncGst)}</td>
                    <td>{s.quote ? <Link href={`/uc1/quotes/${s.quote.id}`} className="text-blue-600 hover:underline">{s.quote.refNumber}</Link> : "—"}</td>
                    <td>{formatDate(s.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
