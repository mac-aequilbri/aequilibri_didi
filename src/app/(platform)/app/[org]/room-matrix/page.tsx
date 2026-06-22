// Room matrix — rooms and finishes grouped by zone (construction domain).

import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadRoomMatrix } from "@/lib/platform/domainListSources";

export const dynamic = "force-dynamic";

export default async function RoomMatrixPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const rooms = await loadRoomMatrix(ctx);

  const zones = new Map<string, typeof rooms>();
  for (const r of rooms) {
    const key = r.zone || "Unzoned";
    if (!zones.has(key)) zones.set(key, []);
    zones.get(key)!.push(r);
  }

  const parseFinishes = (raw: string): [string, string][] => {
    try {
      return Object.entries(JSON.parse(raw)).map(([k, v]) => [k, String(v)]);
    } catch {
      return [];
    }
  };

  return (
    <div className="p-6">
      <PageHeader title="Room Matrix" subtitle="Rooms, areas and finishes by zone." />
      {[...zones.entries()].map(([zone, zoneRooms]) => (
        <section key={zone} className="ae-card p-5 mb-6">
          <h2 className="font-semibold mb-3">{zone}</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-2">Room</th>
                <th className="py-1 pr-2 text-right">Area</th>
                <th className="py-1 pr-2">Ceiling</th>
                <th className="py-1">Finishes</th>
              </tr>
            </thead>
            <tbody>
              {zoneRooms.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2 font-medium whitespace-nowrap">
                    {r.name} <span className="text-xs font-normal text-neutral-400">{r.jobCode}</span>
                  </td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap text-xs">
                    {r.areaSqm ? `${r.areaSqm} m²` : "—"}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap text-xs">{r.ceilingHeight || "—"}</td>
                  <td className="py-2 text-xs text-neutral-600">
                    {parseFinishes(r.finishes).map(([k, v]) => (
                      <span key={k} className="inline-block mr-3">
                        <span className="text-neutral-400">{k}:</span> {v}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {rooms.length === 0 && <p className="text-sm text-neutral-500">No rooms recorded.</p>}
    </div>
  );
}
