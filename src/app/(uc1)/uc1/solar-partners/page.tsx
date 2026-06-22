import { currency } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { loadUc1SolarPartners, type Uc1SolarPartnerView } from "@/lib/platform/uc1Source";
import { createSolarPartner, toggleSolarPartner } from "./actions";

export const dynamic = "force-dynamic";

export default async function SolarPartners() {
  let rows: Uc1SolarPartnerView[] = [];
  try {
    rows = await loadUc1SolarPartners();
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageHeader title="Solar Partners" subtitle={`${rows.length} partners`} />
      <div className="px-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>Name</th><th>Contact</th><th>Fee %</th><th className="text-right">Avg install</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No solar partners.</td></tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.contactName || "—"}</td>
                    <td>{String(p.referralFeePct)}</td>
                    <td className="text-right">{currency(p.avgInstallValue)}</td>
                    <td>{p.isActive ? "Yes" : "No"}</td>
                    <td className="text-right"><form action={toggleSolarPartner}><input type="hidden" name="id" value={p.id} /><button className="btn-ae-outline text-xs">{p.isActive ? "Disable" : "Enable"}</button></form></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <form action={createSolarPartner} className="ae-card p-5 space-y-3 h-fit">
          <h2 className="font-semibold">Add Partner</h2>
          <input name="name" placeholder="Name" required className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
          <input name="contact_name" placeholder="Contact name" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
          <input name="contact_email" type="email" placeholder="Contact email" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
          <div className="flex gap-2">
            <input name="referral_fee_pct" type="number" step="0.01" placeholder="Fee %" defaultValue="10" className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="avg_install_value" type="number" step="0.01" placeholder="Avg install" defaultValue="10000" className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2" />
          </div>
          <button className="btn-ae w-full">Add</button>
        </form>
      </div>
    </div>
  );
}
