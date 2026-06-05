import { cookies } from "next/headers";
import Link from "next/link";
import { prisma as db } from "@/lib/db";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MeetingMinutesPage() {
  let minutes: Awaited<ReturnType<typeof db.uc3MeetingMinutes.findMany>> = [];

  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;
    let tenantId: number | null = val ? Number(val) : null;
    if (!tenantId) {
      const fallback = await db.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }
    if (tenantId) {
      minutes = await db.uc3MeetingMinutes.findMany({
        where: { tenantId },
        orderBy: { meetingDate: "desc" },
        include: { project: { select: { name: true } } },
      });
    }
  } catch {
    // graceful empty state
  }

  const total = minutes.length;
  const raw = minutes.filter((m) => m.status === "raw").length;
  const processed = minutes.filter((m) => m.status === "processed").length;
  const confirmed = minutes.filter((m) => m.status === "confirmed").length;
  const totalActions = minutes.reduce((sum, m) => sum + m.actionsCount, 0);

  return (
    <div className="pb-16">
      <PageHeader
        title="Meeting Minutes"
        subtitle="Record, process, and confirm meeting minutes and extracted action items"
        actions={[{ href: "/uc3/meeting-minutes/new", label: "+ New Minutes" }]}
      />

      <div className="px-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={total} label="Total Meetings" />
          <MetricCard value={raw} label="Unprocessed" />
          <MetricCard value={processed} label="Awaiting Confirm" />
          <MetricCard value={confirmed} label="Confirmed" />
        </div>

        {totalActions > 0 && (
          <div className="ae-card p-4 flex items-center gap-3 bg-blue-50 border border-blue-200">
            <span className="text-blue-600 font-semibold text-sm">
              {totalActions} action item{totalActions !== 1 ? "s" : ""} extracted across all meetings
            </span>
          </div>
        )}

        <div className="ae-card overflow-hidden">
          {minutes.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No meeting minutes yet.{" "}
              <Link href="/uc3/meeting-minutes/new" className="text-blue-600 underline">
                Add the first one.
              </Link>
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Project</th>
                  <th>Meeting Date</th>
                  <th>Attendees</th>
                  <th>Actions</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {minutes.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium">
                      <Link
                        href={`/uc3/meeting-minutes/${m.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {m.title || "(untitled)"}
                      </Link>
                    </td>
                    <td>
                      {(m as typeof m & { project?: { name: string } | null }).project?.name ?? "—"}
                    </td>
                    <td>{formatDate(m.meetingDate)}</td>
                    <td className="text-neutral-500 text-sm max-w-xs">
                      <span className="line-clamp-1">{m.attendees || "—"}</span>
                    </td>
                    <td className="text-center">
                      {m.actionsCount > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          {m.actionsCount}
                        </span>
                      ) : (
                        <span className="text-neutral-300 text-sm">—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                    <td>
                      <Link
                        href={`/uc3/meeting-minutes/${m.id}`}
                        className="btn-ae-outline text-xs py-1 px-3"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
