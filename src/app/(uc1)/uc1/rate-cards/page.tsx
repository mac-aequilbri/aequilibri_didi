import { prisma } from "@/lib/db";
import { currency } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { MATERIAL_CHOICES, PITCH_CHOICES, materialDisplay } from "@/services/uc1/constants";
import { createRateCard, toggleRateCard, deleteRateCard } from "./actions";

export const dynamic = "force-dynamic";

export default async function RateCards() {
  let cards: Awaited<ReturnType<typeof prisma.uc1RateCard.findMany>> = [];
  try {
    cards = await prisma.uc1RateCard.findMany({ orderBy: [{ material: "asc" }, { pitchType: "asc" }] });
  } catch {
    cards = [];
  }

  return (
    <div>
      <PageHeader title="Rate Cards" subtitle={`${cards.length} rates`} />
      <div className="px-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 ae-card overflow-hidden">
          <table className="ae-table">
            <thead>
              <tr><th>Material</th><th>Pitch</th><th>Description</th><th className="text-right">Rate ex GST</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {cards.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No rate cards.</td></tr>
              ) : (
                cards.map((c) => (
                  <tr key={c.id}>
                    <td>{materialDisplay(c.material)}</td>
                    <td>{c.pitchType}</td>
                    <td>{c.description}</td>
                    <td className="text-right">{currency(c.rateExGst)} / {c.unit}</td>
                    <td>{c.isActive ? "Yes" : "No"}</td>
                    <td className="text-right whitespace-nowrap">
                      <form action={toggleRateCard} className="inline"><input type="hidden" name="id" value={c.id} /><button className="btn-ae-outline text-xs mr-1">{c.isActive ? "Disable" : "Enable"}</button></form>
                      <form action={deleteRateCard} className="inline"><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-700">Delete</button></form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form action={createRateCard} className="ae-card p-5 space-y-3 h-fit">
          <h2 className="font-semibold">Add Rate</h2>
          <select name="material" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2">
            {MATERIAL_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select name="pitch_type" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2">
            {PITCH_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input name="description" placeholder="Description" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
          <div className="flex gap-2">
            <input name="rate_ex_gst" type="number" step="0.01" placeholder="Rate ex GST" required className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="unit" defaultValue="m²" className="w-20 border border-[var(--ae-earth)] rounded px-3 py-2" />
          </div>
          <button className="btn-ae w-full">Add</button>
        </form>
      </div>
    </div>
  );
}
