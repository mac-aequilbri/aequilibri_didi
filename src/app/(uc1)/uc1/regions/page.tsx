import { currency } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { loadUc1Regions, type Uc1RegionView } from "@/lib/platform/uc1Source";
import { createRegion, toggleRegion, seedDefaultRegions } from "./actions";

export const dynamic = "force-dynamic";

export default async function RegionsPage() {
  let rows: Uc1RegionView[] = [];
  try {
    rows = await loadUc1Regions();
  } catch { rows = []; }

  return (
    <div>
      <PageHeader
        title="Regions"
        subtitle="Townsville Metro · Cairns · Mackay — travel rates and pricing premiums"
      />
      <div className="px-8 space-y-4">
        {rows.length === 0 && (
          <div className="ae-card p-4 bg-amber-50 border border-amber-200 flex items-center justify-between">
            <span className="text-sm text-amber-800">No regions configured. Seed the Port City defaults to get started.</span>
            <form action={seedDefaultRegions}><button className="btn-ae text-sm">Seed defaults</button></form>
          </div>
        )}

        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead>
              <tr>
                <th>Region</th><th>Postcodes</th><th className="text-right">Travel days</th>
                <th className="text-right">Travel rate/day</th><th className="text-right">Premium %</th>
                <th>Active</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-neutral-500">No regions.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={r.isActive ? "" : "opacity-40"}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-xs text-neutral-500 max-w-[180px] truncate">{r.postcodes || "—"}</td>
                    <td className="text-right">{r.travelDays}</td>
                    <td className="text-right">{currency(r.travelRate)}</td>
                    <td className="text-right">{r.premiumPct}%</td>
                    <td>{r.isActive ? "Yes" : "No"}</td>
                    <td className="text-right">
                      <form action={toggleRegion}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn-ae-outline text-xs">{r.isActive ? "Disable" : "Enable"}</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form action={createRegion} className="ae-card p-5 space-y-3">
          <h2 className="font-semibold">Add Region</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="name" placeholder="Region name (e.g. Townsville Metro)" required className="border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="postcodes" placeholder="Postcodes (comma-separated)" className="border border-[var(--ae-earth)] rounded px-3 py-2" />
            <div className="flex gap-2 items-center">
              <label className="text-sm text-neutral-600 w-32">Travel days</label>
              <input name="travel_days" type="number" defaultValue={0} className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-sm text-neutral-600 w-32">Travel rate/day</label>
              <input name="travel_rate" type="number" step="0.01" defaultValue={0} className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-sm text-neutral-600 w-32">Premium %</label>
              <input name="premium_pct" type="number" step="0.1" defaultValue={0} className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
            </div>
          </div>
          <button className="btn-ae">Add Region</button>
        </form>
      </div>
    </div>
  );
}
