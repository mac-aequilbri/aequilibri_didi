import { notFound } from "next/navigation";
import { currency, toNum, formatDate } from "@/lib/format";
import { gst as gstOf, incGst } from "@/lib/money";
import { loadUc1PurchaseOrder } from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

export default async function PoPrint({ params }: { params: Promise<{ po_id: string }> }) {
  const { po_id } = await params;
  const po = await loadUc1PurchaseOrder(po_id);
  if (!po) notFound();

  const exGst = po.items.reduce((s, i) => s + toNum(i.quantity) * toNum(i.unitPriceExGst), 0);

  return (
    <main className="max-w-3xl mx-auto bg-white p-10 my-8 text-sm" style={{ color: "#2c2c2c" }}>
      <div className="flex justify-between items-start border-b pb-4 mb-6" style={{ borderColor: "#bbb2ab" }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#dc9f82" }}>æquilibri Roofing</h1>
          <p className="text-neutral-500">Purchase Order</p>
        </div>
        <div className="text-right">
          <div className="font-bold text-lg">{po.poNumber}</div>
          <div className="text-neutral-500">{po.status.toUpperCase()}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div><div className="text-neutral-500 uppercase text-xs">Vendor</div><div>{po.vendor}</div></div>
        <div><div className="text-neutral-500 uppercase text-xs">Deliver to</div><div>{po.deliveryAddress || "—"}</div></div>
        <div><div className="text-neutral-500 uppercase text-xs">Requested delivery</div><div>{formatDate(po.requestedDeliveryDate)}</div></div>
        <div><div className="text-neutral-500 uppercase text-xs">Raised</div><div>{formatDate(po.createdAt)}</div></div>
      </div>

      <table className="w-full mb-6" style={{ borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "#2c2c2c", color: "#fff" }}><th className="text-left p-2">Description</th><th className="text-right p-2">Qty</th><th className="text-left p-2">Unit</th><th className="text-right p-2">Rate</th><th className="text-right p-2">Amount</th></tr></thead>
        <tbody>
          {po.items.map((i) => (
            <tr key={i.id} style={{ borderBottom: "1px solid #e3ddcd" }}>
              <td className="p-2">{i.description}</td><td className="p-2 text-right">{toNum(i.quantity)}</td><td className="p-2">{i.unit}</td>
              <td className="p-2 text-right">{currency(i.unitPriceExGst)}</td><td className="p-2 text-right">{currency(toNum(i.quantity) * toNum(i.unitPriceExGst))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-right space-y-1">
        <div>Subtotal (ex GST): {currency(exGst)}</div>
        <div>GST (10%): {currency(gstOf(exGst))}</div>
        <div className="text-lg font-bold">Total (inc GST): {currency(incGst(exGst))}</div>
      </div>

      {po.notes && <p className="text-xs text-neutral-600 mt-6 whitespace-pre-wrap">Notes: {po.notes}</p>}
      <p className="text-xs text-neutral-400 mt-10">Use your browser&apos;s Print function (Ctrl/Cmd+P) to produce a PDF.</p>
    </main>
  );
}
