import { prisma } from "@/lib/db";
import { currency } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { createGutteringRate, toggleGutteringRate, deleteGutteringRate } from "./actions";

export const dynamic = "force-dynamic";

const ITEM_TYPES = ["gutter", "downpipe_90mm", "downpipe_100mm", "valley", "ridge", "fascia"];

export default async function GutteringRates() {
  let rows: Awaited<ReturnType<typeof prisma.uc1GutteringRate.findMany>> = [];
  try {
    rows = await prisma.uc1GutteringRate.findMany({ orderBy: { itemType: "asc" } });
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageHeader title="Guttering Rates" subtitle={`${rows.length} rates`} />
      <div className="px-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>Type</th><th>Description</th><th className="text-right">Rate ex GST</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-neutral-500">No guttering rates.</td></tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id}>
                    <td>{c.itemType}</td>
                    <td>{c.description}</td>
                    <td className="text-right">{currency(c.rateExGst)} / {c.unit}</td>
                    <td>{c.isActive ? "Yes" : "No"}</td>
                    <td className="text-right whitespace-nowrap">
                      <form action={toggleGutteringRate} className="inline"><input type="hidden" name="id" value={c.id} /><button className="btn-ae-outline text-xs mr-1">{c.isActive ? "Disable" : "Enable"}</button></form>
                      <form action={deleteGutteringRate} className="inline"><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-700">Delete</button></form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <form action={createGutteringRate} className="ae-card p-5 space-y-3 h-fit">
          <h2 className="font-semibold">Add Rate</h2>
          <select name="item_type" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2">{ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <input name="description" placeholder="Description" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
          <div className="flex gap-2">
            <input name="rate_ex_gst" type="number" step="0.01" placeholder="Rate" required className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="unit" defaultValue="lm" className="w-20 border border-[var(--ae-earth)] rounded px-3 py-2" />
          </div>
          <button className="btn-ae w-full">Add</button>
        </form>
      </div>
    </div>
  );
}
