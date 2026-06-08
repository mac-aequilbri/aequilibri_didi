import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currency, toNum, formatDate } from "@/lib/format";
import { gst as gstOf, incGst } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { updatePoStatus } from "../actions";

export const dynamic = "force-dynamic";

const PO_STATUS: [string, string][] = [
  ["draft", "Draft"],
  ["sent", "Sent to Vendor"],
  ["confirmed", "Confirmed"],
  ["cancelled", "Cancelled"],
];

export default async function PoDetail({ params }: { params: Promise<{ po_id: string }> }) {
  const { po_id } = await params;
  const id = Number(po_id);
  if (!Number.isInteger(id)) notFound();

  const po = await prisma.uc1PurchaseOrder
    .findUnique({ where: { id }, include: { vendor: true, poItems: { orderBy: { sortOrder: "asc" } } } })
    .catch(() => null);
  if (!po) notFound();

  const exGst = po.poItems.reduce((s, i) => s + toNum(i.quantity) * toNum(i.unitPriceExGst), 0);

  return (
    <div>
      <PageHeader title={po.poNumber} subtitle={`Vendor: ${po.vendor.name}`} actions={[{ href: `/uc1/purchase-orders/${po.id}/print`, label: "Print" }, { href: "/uc1/purchase-orders", label: "Back", variant: "outline" }]} />
      <div className="px-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>Description</th><th className="text-right">Qty</th><th>Unit</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {po.poItems.map((i) => (
                <tr key={i.id}>
                  <td>{i.description}</td><td className="text-right">{toNum(i.quantity)}</td><td>{i.unit}</td>
                  <td className="text-right">{currency(i.unitPriceExGst)}</td>
                  <td className="text-right">{currency(toNum(i.quantity) * toNum(i.unitPriceExGst))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-4 border-t border-[var(--ae-earth)] text-right space-y-1">
            <div className="text-sm text-neutral-600">Subtotal: {currency(exGst)}</div>
            <div className="text-sm text-neutral-600">GST: {currency(gstOf(exGst))}</div>
            <div className="text-lg font-bold">Total inc GST: {currency(incGst(exGst))}</div>
          </div>
        </div>
        <div className="ae-card p-5">
          <h3 className="font-semibold mb-3">Details</h3>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-neutral-500">Status</dt><dd><StatusBadge status={po.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-neutral-500">Created</dt><dd>{formatDate(po.createdAt)}</dd></div>
          </dl>
          <form action={updatePoStatus} className="mt-4 flex items-center gap-2">
            <input type="hidden" name="id" value={po.id} />
            <select name="status" defaultValue={po.status} className="ae-input text-sm flex-1">
              {PO_STATUS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <button type="submit" className="btn-ae-outline text-xs">Update</button>
          </form>
        </div>
      </div>
    </div>
  );
}
