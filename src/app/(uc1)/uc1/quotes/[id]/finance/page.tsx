import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currency, toNum } from "@/lib/format";
import { incGst } from "@/lib/money";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

function monthlyPayment(principal: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export default async function QuoteFinance({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const quote = await prisma.uc1Quote.findUnique({ where: { id: quoteId }, include: { items: true } }).catch(() => null);
  if (!quote) notFound();
  const total = incGst(quote.items.reduce((s, i) => s + toNum(i.quantity) * toNum(i.unitPriceExGst), 0));

  const providers = await prisma.uc1FinanceProvider.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }).catch(() => []);

  return (
    <div>
      <PageHeader title="Finance Options" subtitle={`${quote.refNumber} · ${currency(total)} inc GST`} actions={[{ href: `/uc1/quotes/${quote.id}`, label: "Back to Quote", variant: "outline" }]} />
      <div className="px-8">
        {providers.length === 0 ? (
          <div className="ae-card p-6 text-neutral-600">No active finance providers. Add some under <strong>Finance</strong>.</div>
        ) : (
          <div className="ae-card overflow-hidden">
            <table className="ae-table">
              <thead><tr><th>Provider</th><th>Rate %</th><th className="text-right">Min term pmt</th><th className="text-right">Max term pmt</th><th>Tagline</th></tr></thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{String(p.interestRatePct)}</td>
                    <td className="text-right">{currency(monthlyPayment(total, toNum(p.interestRatePct), p.minTermMonths))}/mo <span className="text-neutral-400">({p.minTermMonths}mo)</span></td>
                    <td className="text-right">{currency(monthlyPayment(total, toNum(p.interestRatePct), p.maxTermMonths))}/mo <span className="text-neutral-400">({p.maxTermMonths}mo)</span></td>
                    <td>{p.tagline}</td>
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
