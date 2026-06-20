import Link from "next/link";
import { currency, formatDate } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { loadUc1PurchaseOrders, type Uc1PurchaseOrderView } from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

export default async function PurchaseOrders() {
  let rows: Uc1PurchaseOrderView[] = [];
  try {
    rows = await loadUc1PurchaseOrders();
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
