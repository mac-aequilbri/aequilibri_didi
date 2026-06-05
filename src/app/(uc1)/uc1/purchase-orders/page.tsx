import Link from "next/link";
import { prisma } from "@/lib/db";
import { currency, toNum, formatDate } from "@/lib/format";
import { incGst } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function PurchaseOrders() {
  let rows: { id: number; poNumber: string; vendor: string; status: string; createdAt: Date; total: number }[] = [];
  try {
    const pos = await prisma.uc1PurchaseOrder.findMany({ orderBy: { createdAt: "desc" }, include: { vendor: true, poItems: true } });
    rows = pos.map((p) => ({
      id: p.id,
      poNumber: p.poNumber,
      vendor: p.vendor.name,
      status: p.status,
      createdAt: p.createdAt,
      total: incGst(p.poItems.reduce((s, i) => s + toNum(i.quantity) * toNum(i.unitPriceExGst), 0)),
    }));
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle={`${rows.length} POs`} />
      <div className="px-8">
        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>PO</th><th>Vendor</th><th>Status</th><th className="text-right">Total inc GST</th><th>Created</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-neutral-500">No purchase orders.</td></tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/uc1/purchase-orders/${p.id}`} className="text-[var(--ae-space)] font-semibold">{p.poNumber}</Link></td>
                    <td>{p.vendor}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-right">{currency(p.total)}</td>
                    <td>{formatDate(p.createdAt)}</td>
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
