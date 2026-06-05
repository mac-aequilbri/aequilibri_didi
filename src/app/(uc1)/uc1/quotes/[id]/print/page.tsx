import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currency, toNum } from "@/lib/format";
import { gst as gstOf, incGst } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function QuotePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const quote = await prisma.uc1Quote
    .findUnique({ where: { id: quoteId }, include: { items: { orderBy: { sortOrder: "asc" } }, contact: true } })
    .catch(() => null);
  if (!quote) notFound();

  const exGst = quote.items.reduce((s, i) => s + toNum(i.quantity) * toNum(i.unitPriceExGst), 0);

  return (
    <main className="max-w-3xl mx-auto bg-white p-10 my-8 text-sm" style={{ color: "#2c2c2c" }}>
      <div className="flex justify-between items-start border-b pb-4 mb-6" style={{ borderColor: "#bbb2ab" }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#dc9f82" }}>æquilibri Roofing</h1>
          <p className="text-neutral-500">Quotation</p>
        </div>
        <div className="text-right">
          <div className="font-bold text-lg">{quote.refNumber}</div>
          <div className="text-neutral-500">{quote.status.toUpperCase()}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div><div className="text-neutral-500 uppercase text-xs">Property</div><div>{quote.propertyAddress}</div></div>
        <div><div className="text-neutral-500 uppercase text-xs">Client</div><div>{quote.contact?.name ?? "—"}</div></div>
      </div>

      <table className="w-full mb-6" style={{ borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "#2c2c2c", color: "#fff" }}><th className="text-left p-2">Description</th><th className="text-right p-2">Qty</th><th className="text-left p-2">Unit</th><th className="text-right p-2">Rate</th><th className="text-right p-2">Amount</th></tr></thead>
        <tbody>
          {quote.items.map((i) => (
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

      <p className="text-xs text-neutral-400 mt-10">Use your browser&apos;s Print function (Ctrl/Cmd+P) to produce a PDF.</p>
    </main>
  );
}
