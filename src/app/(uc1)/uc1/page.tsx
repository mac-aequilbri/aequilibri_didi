import Link from "next/link";
import { prisma } from "@/lib/db";
import { currency, toNum, formatDate } from "@/lib/format";
import { incGst } from "@/lib/money";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface QuoteRow {
  id: number;
  refNumber: string;
  propertyAddress: string;
  status: string;
  createdAt: Date;
  total: number;
  contactName: string | null;
}

async function loadDashboard() {
  // Recent quotes + active rate-card count. Graceful empty state if the DB
  // isn't connected yet (the schema targets the existing Postgres at cutover).
  try {
    const [quotes, rateCardCount, quoteCount] = await Promise.all([
      prisma.uc1Quote.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { items: true, contact: true },
      }),
      prisma.uc1RateCard.count({ where: { isActive: true } }),
      prisma.uc1Quote.count(),
    ]);

    const rows: QuoteRow[] = quotes.map((q) => {
      const exGst = q.items.reduce((s, i) => s + toNum(i.quantity) * toNum(i.unitPriceExGst), 0);
      return {
        id: q.id,
        refNumber: q.refNumber,
        propertyAddress: q.propertyAddress,
        status: q.status,
        createdAt: q.createdAt,
        total: incGst(exGst),
        contactName: q.contact?.name ?? null,
      };
    });
    const pipeline = rows.reduce((s, r) => s + r.total, 0);
    return { rows, rateCardCount, quoteCount, pipeline, connected: true };
  } catch {
    return { rows: [], rateCardCount: 0, quoteCount: 0, pipeline: 0, connected: false };
  }
}

export default async function Uc1Dashboard() {
  const { rows, rateCardCount, quoteCount, pipeline, connected } = await loadDashboard();

  return (
    <div>
      <PageHeader
        title="Roofing Estimator"
        subtitle="Port City pricing · AI roof measurement · quotes & POs"
        actions={[{ href: "/uc1/quotes/new", label: "+ New Quote" }]}
      />
      <div className="px-8">
        {!connected && (
          <div className="ae-card p-4 mb-6 text-sm text-neutral-600">
            Database not connected. Set <code>DATABASE_URL</code> to the existing Postgres to see live data.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <MetricCard value={quoteCount} label="Total Quotes" />
          <MetricCard value={currency(pipeline)} label="Recent Pipeline (inc GST)" />
          <MetricCard value={rateCardCount} label="Active Rate Cards" />
        </div>

        <div className="ae-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--ae-earth)]">
            <h2 className="text-lg font-semibold">Recent Quotes</h2>
            <Link href="/uc1/quotes" className="btn-ae-outline text-sm">
              View all
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-neutral-500">No quotes yet.</p>
          ) : (
            <table className="ae-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Property</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/uc1/quotes/${r.id}`} className="text-[var(--ae-space)] font-semibold">
                        {r.refNumber}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate">{r.propertyAddress}</td>
                    <td>{r.contactName ?? "—"}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-right">{currency(r.total)}</td>
                    <td>{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
