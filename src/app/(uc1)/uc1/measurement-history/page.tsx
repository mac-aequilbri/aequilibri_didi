import Link from "next/link";
import { prisma } from "@/lib/db";
import { currency, formatDate, toNum } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { normalizeAddressKey } from "@/services/uc1/correctionMemory";

export const dynamic = "force-dynamic";

export default async function MeasurementHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const key = normalizeAddressKey(query);

  let snapshots: {
    id: number;
    address: string;
    totalAreaM2: number;
    sectionCount: number;
    storeys: number;
    snapshotType: string;
    createdAt: Date;
    quote: { id: number; refNumber: string } | null;
  }[] = [];
  let quoteSnapshots: {
    id: number;
    address: string;
    roofType: string;
    totalIncGst: number;
    createdAt: Date;
    quote: { id: number; refNumber: string } | null;
  }[] = [];

  try {
    const where = query
      ? { OR: [{ address: { contains: query } }, { addressKey: { contains: key } }] }
      : {};

    const [snaps, qsnaps] = await Promise.all([
      prisma.uc1MeasurementSnapshot.findMany({
        where,
        include: { quote: { select: { id: true, refNumber: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.uc1QuoteSnapshot.findMany({
        where,
        include: { quote: { select: { id: true, refNumber: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    snapshots = snaps.map((s) => ({
      id: s.id,
      address: s.address,
      totalAreaM2: toNum(s.totalAreaM2),
      sectionCount: s.sectionCount,
      storeys: s.storeys,
      snapshotType: s.snapshotType,
      createdAt: s.createdAt,
      quote: s.quote,
    }));
    quoteSnapshots = qsnaps.map((s) => ({
      id: s.id,
      address: s.address,
      roofType: s.roofType,
      totalIncGst: toNum(s.totalIncGst),
      createdAt: s.createdAt,
      quote: s.quote,
    }));
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
