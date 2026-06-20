import Link from "next/link";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { loadUc1StormEvents, type Uc1StormEventView } from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

export default async function StormDashboard() {
  let rows: Uc1StormEventView[] = [];
  try {
    rows = await loadUc1StormEvents();
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageHeader title="Storm Leads" subtitle={`${rows.length} storm events`} />
      <div className="px-8">
        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>Event</th><th>Type</th><th>State</th><th className="text-right">Leads</th><th>Date</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-neutral-500">No storm events.</td></tr>
              ) : (
                rows.map((e) => (
                  <tr key={e.id}>
                    <td className="font-medium"><Link href={`/uc1/storm/${e.id}`} className="text-blue-600 hover:underline">{e.name}</Link></td><td>{e.eventType}</td><td>{e.state}</td>
                    <td className="text-right">{e.leads}</td><td>{formatDate(e.eventDate)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
