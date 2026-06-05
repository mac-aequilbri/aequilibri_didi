import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { createFinanceProvider, toggleFinanceProvider } from "./actions";

export const dynamic = "force-dynamic";

export default async function FinanceProviders() {
  let rows: Awaited<ReturnType<typeof prisma.uc1FinanceProvider.findMany>> = [];
  try {
    rows = await prisma.uc1FinanceProvider.findMany({ orderBy: { name: "asc" } });
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageHeader title="Finance Providers" subtitle={`${rows.length} providers`} />
      <div className="px-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>Name</th><th>Rate %</th><th>Term (mo)</th><th>Tagline</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No finance providers.</td></tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{String(p.interestRatePct)}</td>
                    <td>{p.minTermMonths}–{p.maxTermMonths}</td>
                    <td>{p.tagline}</td>
                    <td>{p.isActive ? "Yes" : "No"}</td>
                    <td className="text-right"><form action={toggleFinanceProvider}><input type="hidden" name="id" value={p.id} /><button className="btn-ae-outline text-xs">{p.isActive ? "Disable" : "Enable"}</button></form></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <form action={createFinanceProvider} className="ae-card p-5 space-y-3 h-fit">
          <h2 className="font-semibold">Add Provider</h2>
          <input name="name" placeholder="Name" required className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
          <input name="interest_rate_pct" type="number" step="0.01" placeholder="Interest rate %" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
          <div className="flex gap-2">
            <input name="min_term_months" type="number" placeholder="Min mo" defaultValue="12" className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="max_term_months" type="number" placeholder="Max mo" defaultValue="60" className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
          </div>
          <input name="tagline" placeholder="Tagline" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
          <button className="btn-ae w-full">Add</button>
        </form>
      </div>
    </div>
  );
}
