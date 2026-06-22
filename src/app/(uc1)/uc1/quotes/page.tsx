import Link from "next/link";
import { currency, formatDate } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { loadUc1Quotes } from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

const STATUSES = ["all", "draft", "sent", "accepted", "rejected"] as const;

export default async function QuoteList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "all" } = await searchParams;
  const { rows, connected } = await loadUc1Quotes(status);

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle={`${rows.length} quote${rows.length === 1 ? "" : "s"}`}
        actions={[{ href: "/uc1/quotes/new", label: "+ New Quote" }]}
      />
      <div className="px-8">
        <div className="flex gap-2 mb-4">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={s === "all" ? "/uc1/quotes" : `/uc1/quotes?status=${s}`}
              className={s === status ? "btn-ae text-sm" : "btn-ae-outline text-sm"}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </Link>
          ))}
        </div>

        {!connected && (
          <div className="ae-card p-4 mb-4 text-sm text-neutral-600">Database not connected.</div>
        )}

        <div className="ae-card overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-neutral-500">No quotes.</p>
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
