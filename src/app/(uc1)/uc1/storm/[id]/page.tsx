import { notFound } from "next/navigation";
import { currency, formatDate, toNum } from "@/lib/format";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { loadUc1StormEvent } from "@/lib/platform/uc1Source";
import { addStormLead, importStormLeadsCsv, updateStormLead } from "../actions";

export const dynamic = "force-dynamic";

const LEAD_STATUS: [string, string][] = [
  ["new", "New — Not Contacted"],
  ["contacted", "Contacted"],
  ["quoted", "Quoted"],
  ["won", "Won"],
  ["lost", "Lost / No Response"],
];

export default async function StormDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await loadUc1StormEvent(id);
  if (!event) notFound();

  const leads = event.leads;
  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    quoted: leads.filter((l) => l.status === "quoted").length,
    won: leads.filter((l) => l.status === "won").length,
    pipeline: leads
      .filter((l) => ["new", "contacted", "quoted"].includes(l.status))
      .reduce((s, l) => s + toNum(l.estimatedValue), 0),
  };
  const inp = "w-full border border-[var(--ae-earth)] rounded px-3 py-2 text-sm";

  return (
    <div className="pb-16">
      <PageHeader
        title={event.name}
        subtitle={`${event.eventType} · severity ${event.severity} · ${formatDate(event.eventDate)}`}
        actions={[{ href: "/uc1/storm", label: "← All Storms", variant: "outline" }]}
      />

      <div className="px-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard value={stats.total} label="Total Leads" />
          <MetricCard value={stats.new} label="New" />
          <MetricCard value={stats.contacted} label="Contacted" />
          <MetricCard value={stats.won} label="Won" />
          <MetricCard value={currency(stats.pipeline)} label="Open Pipeline" />
        </div>

        <div className="ae-card p-4 text-sm text-neutral-600">
          <strong>Affected suburbs:</strong> {event.affectedSuburbs || "—"}
        </div>

        {/* Leads table */}
        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]"><h6 className="font-bold">Leads</h6></div>
          <table className="ae-table">
            <thead>
              <tr><th>Address</th><th>Suburb</th><th className="text-right">Area</th><th className="text-right">Est. Value</th><th>Contact</th><th>Status</th></tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No leads yet — add one below or import a CSV.</td></tr>
              ) : (
                leads.map((l) => (
                  <tr key={l.id}>
                    <td>{l.address}</td>
                    <td>{l.suburb}</td>
                    <td className="text-right">{toNum(l.roofAreaSqm) || "—"}</td>
                    <td className="text-right">{currency(l.estimatedValue)}</td>
                    <td>{l.contactName || "—"}{l.contactPhone ? ` · ${l.contactPhone}` : ""}</td>
                    <td>
                      <form action={updateStormLead} className="flex items-center gap-1">
                        <input type="hidden" name="lead_id" value={l.id} />
                        <input type="hidden" name="storm_event_id" value={event.id} />
                        <select name="status" defaultValue={l.status} className="border border-[var(--ae-earth)] rounded px-1 py-0.5 text-xs">
                          {LEAD_STATUS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                        <button className="text-xs text-blue-600 hover:underline">save</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Add single lead */}
          <div className="ae-card p-5">
            <h6 className="font-bold mb-3">＋ Add Lead</h6>
            <form action={addStormLead} className="space-y-2">
              <input type="hidden" name="storm_event_id" value={event.id} />
              <label className="block text-sm">Address *<input name="address" required className={inp} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">Suburb<input name="suburb" className={inp} /></label>
                <label className="block text-sm">Roof area m²<input name="roof_area_sqm" type="number" step="0.01" className={inp} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">Est. value<input name="estimated_value" type="number" step="0.01" className={inp} /></label>
                <label className="block text-sm">Contact name<input name="contact_name" className={inp} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">Phone<input name="contact_phone" className={inp} /></label>
                <label className="block text-sm">Email<input name="contact_email" type="email" className={inp} /></label>
              </div>
              <button className="btn-ae text-sm">Add Lead</button>
            </form>
          </div>

          {/* CSV import */}
          <div className="ae-card p-5">
            <h6 className="font-bold mb-3">Import CSV</h6>
            <p className="text-xs text-neutral-500 mb-2">One lead per line: <code>address, suburb, area, value, name, phone</code></p>
            <form action={importStormLeadsCsv} className="space-y-2">
              <input type="hidden" name="storm_event_id" value={event.id} />
              <textarea name="csv_text" rows={6} className={inp} placeholder="12 Smith St, Ayr, 180, 24000, Jane Doe, 0400 000 000" />
              <button className="btn-ae-outline text-sm">Import Leads</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
