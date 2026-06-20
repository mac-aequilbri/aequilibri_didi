import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate, toNum } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadProcurement } from "@/lib/platform/procurementSource";
import { orgPath } from "@/lib/platform/paths";
import { setProcurementStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "ordered", "delivered", "invoiced", "paid"];

export default async function ProcurementPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const orders = await loadProcurement(ctx);

  return (
    <div className="p-6">
      <PageHeader
        title="Procurement"
        subtitle="Orders tracked from pending through to paid."
        actions={[{ href: orgPath(ctx.orgSlug, "/procurement/new"), label: "+ New order" }]}
      />
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Item</th>
              <th className="py-1 pr-2">Vendor</th>
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1 pr-2 text-right">Total</th>
              <th className="py-1 pr-2">Due</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="py-2 pr-2">
                  <span className="font-medium">{o.item}</span>
                  <span className="ml-1 text-xs text-neutral-400">{o.jobCode}</span>
                </td>
                <td className="py-2 pr-2 text-xs">{o.vendorName || "—"}</td>
                <td className="py-2 pr-2 text-right text-xs">{o.qty}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(toNum(o.total))}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">
                  {o.dueDate ? formatDate(o.dueDate) : "—"}
                </td>
                <td className="py-2 whitespace-nowrap">
                  <form action={setProcurementStatus} className="flex items-center gap-1">
                    <input type="hidden" name="org" value={ctx.orgSlug} />
                    <input type="hidden" name="recordId" value={o.id} />
                    <StatusBadge status={o.status} />
                    <select name="status" defaultValue={o.status} className="text-xs border border-neutral-200 rounded px-1 py-0.5">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-ae-outline text-xs">
                      Set
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={6}>
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
