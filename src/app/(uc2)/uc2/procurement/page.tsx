import { prisma } from "@/lib/db";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate } from "@/lib/format";
import { updateProcurementStatus } from "../actions";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "ordered", "delivered", "invoiced", "paid"] as const;

export default async function ProcurementPage() {
  let items: Awaited<ReturnType<typeof prisma.uc2Procurement.findMany>> = [];

  try {
    items = await prisma.uc2Procurement.findMany({
      orderBy: { createdAt: "desc" },
    });
  } catch {
    // empty state on error
  }

  const totalValue = items.reduce((sum, r) => sum + Number(r.total), 0);
  const pendingCount = items.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procurement"
        subtitle="Track materials, equipment and vendor orders for Dulong Downs"
        actions={[{ href: "/uc2/procurement/new", label: "+ New Order" }]}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard value={items.length} label="Total Orders" />
        <MetricCard value={currency(totalValue)} label="Total Value" />
        <MetricCard value={pendingCount} label="Pending" />
      </div>

      {items.length === 0 ? (
        <div className="ae-card text-center py-12 text-neutral-500">
          No procurement records found.
        </div>
      ) : (
        <div className="ae-card overflow-x-auto">
          <table className="ae-table w-full">
            <thead>
              <tr>
                <th>Item</th>
                <th>Vendor</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit Price</th>
                <th className="text-right">Total</th>
                <th>Due Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.item}</td>
                  <td className="text-sm text-neutral-600">{row.vendorName ?? <span className="text-neutral-400">—</span>}</td>
                  <td className="text-right text-sm">{Number(row.quantity)}</td>
                  <td className="text-right text-sm">{currency(row.unitPrice)}</td>
                  <td className="text-right font-medium">{currency(row.total)}</td>
                  <td className="text-sm whitespace-nowrap">{formatDate(row.dueDate)}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <form action={updateProcurementStatus} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={row.id} />
                      <select
                        name="status"
                        defaultValue={row.status}
                        className="text-xs border border-neutral-200 rounded px-1 py-0.5 bg-white"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn-ae-outline text-xs px-2 py-0.5">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
