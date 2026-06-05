import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currency } from "@/lib/format";
import { materialDisplay } from "@/services/uc1/constants";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function PurchaseCompare({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const quote = await prisma.uc1Quote.findUnique({ where: { id: quoteId }, select: { refNumber: true, material: true } }).catch(() => null);
  if (!quote) notFound();

  const prices = await prisma.uc1VendorMaterialPrice
    .findMany({ where: { isAvailable: true, vendor: { isActive: true }, material: quote.material }, include: { vendor: true }, orderBy: { unitPriceExGst: "asc" } })
    .catch(() => []);

  return (
    <div>
      <PageHeader title="Compare Vendors" subtitle={`${quote.refNumber} · ${materialDisplay(quote.material)}`} actions={[{ href: `/uc1/quotes/${quoteId}`, label: "Back to Quote", variant: "outline" }]} />
      <div className="px-8">
        {prices.length === 0 ? (
          <div className="ae-card p-6 text-neutral-600">No active vendor prices for {materialDisplay(quote.material)}.</div>
        ) : (
          <div className="ae-card overflow-hidden">
            <table className="ae-table">
              <thead><tr><th>Vendor</th><th>Item</th><th className="text-right">Price ex GST</th><th>Unit</th><th className="text-right">Lead days</th></tr></thead>
              <tbody>
                {prices.map((p, i) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.vendor.name}{i === 0 && <span className="ml-2 status-badge status-active">cheapest</span>}</td>
                    <td>{p.description}</td>
                    <td className="text-right">{currency(p.unitPriceExGst)}</td>
                    <td>{p.unit}</td>
                    <td className="text-right">{p.leadDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
