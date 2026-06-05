import { PageHeader, MetricCard } from "@/components/PageHeader";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type RoomWithZone = Awaited<
  ReturnType<typeof prisma.uc2RoomMatrix.findMany<{ include: { zone: true } }>>
>[number];

export default async function RoomMatrixPage() {
  let rooms: RoomWithZone[] = [];

  try {
    rooms = await prisma.uc2RoomMatrix.findMany({
      include: { zone: true },
      orderBy: [{ zone: { name: "asc" } }, { roomName: "asc" }],
    });
  } catch {
    // empty state on error
  }

  // Group by zone name
  const zoneMap = new Map<string, RoomWithZone[]>();
  for (const room of rooms) {
    const zoneName = room.zone?.name ?? "Unassigned";
    if (!zoneMap.has(zoneName)) zoneMap.set(zoneName, []);
    zoneMap.get(zoneName)!.push(room);
  }

  const zoneEntries = Array.from(zoneMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const totalZones = zoneEntries.length;
  const totalRooms = rooms.length;
  const totalArea = rooms.reduce(
    (sum, r) => sum + (r.areaSqm ? Number(r.areaSqm) : 0),
    0
  );

  return (
    <div>
      <PageHeader
        title="Room Matrix"
        subtitle="Dulong Downs — room finishes by zone (read-only)"
      />

      <div className="px-8 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricCard value={totalZones} label="Zones" />
          <MetricCard value={totalRooms} label="Rooms" />
          <MetricCard
            value={totalArea > 0 ? `${totalArea.toFixed(1)} m²` : "—"}
            label="Total Area"
          />
        </div>

        {/* Zone cards */}
        {zoneEntries.length === 0 ? (
          <div className="ae-card p-6 text-neutral-500 text-sm">
            No room data found.
          </div>
        ) : (
          zoneEntries.map(([zoneName, zoneRooms]) => {
            const zoneArea = zoneRooms.reduce(
              (sum, r) => sum + (r.areaSqm ? Number(r.areaSqm) : 0),
              0
            );
            return (
              <div key={zoneName} className="ae-card overflow-x-auto">
                <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-neutral-100">
                  <h2 className="font-semibold text-base">{zoneName}</h2>
                  <span className="text-xs text-neutral-400">
                    {zoneRooms.length} room{zoneRooms.length !== 1 ? "s" : ""}
                    {zoneArea > 0 ? ` · ${zoneArea.toFixed(1)} m²` : ""}
                  </span>
                </div>
                <table className="ae-table w-full">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Area (m²)</th>
                      <th>Floor Finish</th>
                      <th>Wall Finish</th>
                      <th>Ceiling Height (m)</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoneRooms.map((room) => (
                      <tr key={room.id}>
                        <td className="font-medium">{room.roomName}</td>
                        <td className="text-sm text-neutral-600">
                          {room.areaSqm != null
                            ? Number(room.areaSqm).toFixed(2)
                            : "—"}
                        </td>
                        <td className="text-sm">{room.floorFinish || "—"}</td>
                        <td className="text-sm">{room.wallFinish || "—"}</td>
                        <td className="text-sm">
                          {Number(room.ceilingHeight).toFixed(2)}
                        </td>
                        <td className="text-sm text-neutral-500 max-w-xs truncate">
                          {room.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}

        <p className="text-xs text-neutral-400">
          Read-only view. Room data is managed via seed scripts or the Django
          admin.
        </p>
      </div>
    </div>
  );
}
