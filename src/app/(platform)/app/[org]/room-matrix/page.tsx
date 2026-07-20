// Room matrix — rooms and finishes grouped by zone (construction domain).

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadRoomMatrix } from "@/lib/platform/domainListSources";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function RoomMatrixPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ zone?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { zone: zoneFilter } = await searchParams;
  const rooms = await loadRoomMatrix(ctx);

  const allZones = new Map<string, typeof rooms>();
  for (const r of rooms) {
    const key = r.zone || "Unzoned";
    if (!allZones.has(key)) allZones.set(key, []);
    allZones.get(key)!.push(r);
  }
  const zones = zoneFilter
    ? new Map([...allZones.entries()].filter(([zone]) => zone === zoneFilter))
    : allZones;

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
      {allZones.size > 0 && (
        <form
          method="get"
          action={orgPath(ctx.orgSlug, "/room-matrix")}
          className="mb-4 flex items-center gap-2 text-sm"
        >
          <label htmlFor="room-matrix-zone-filter" className="text-neutral-600">
            Zone
          </label>
          <select
            id="room-matrix-zone-filter"
            name="zone"
            defaultValue={zoneFilter ?? ""}
            className="text-sm border border-neutral-200 rounded px-2 py-1"
          >
            <option value="">All zones</option>
            {[...allZones.keys()].map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-ae-outline text-xs">
            Filter
          </button>
        </form>
      )}
      {[...zones.entries()].map(([zone, zoneRooms]) => (
        <section key={zone} className="ae-card p-5 mb-6">
          <h2 className="font-semibold mb-3">{zone}</h2>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th scope="col" className="py-1 pr-2">Room</th>
                <th scope="col" className="py-1 pr-2 text-right">Area</th>
                <th scope="col" className="py-1 pr-2">Ceiling</th>
                <th scope="col" className="py-1">Finishes</th>
              </tr>
            </thead>
            <tbody>
              {zoneRooms.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2 font-medium whitespace-nowrap">
                    <Link
                      href={orgPath(ctx.orgSlug, `/room-matrix/${r.id}`)}
                      className="hover:text-[var(--ae-space)] hover:underline"
                    >
                      {r.name}
                    </Link>{" "}
                    <span className="text-xs font-normal text-neutral-400">{r.jobCode}</span>
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
          </div>
        </section>
      ))}
      {rooms.length === 0 && <p className="text-sm text-neutral-500">No rooms recorded.</p>}
    </div>
  );
}
