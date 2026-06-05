import { notFound } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { getTenantId } from "@/lib/uc3-tenant";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { confirmMeetingMinutes } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

type ExtractedAction = {
  action?: string;
  owner?: string;
  due_date?: string;
  priority?: string;
};

export default async function MeetingMinutesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const minutesId = Number(id);
  const tenantId = await getTenantId();

  if (!tenantId || isNaN(minutesId)) notFound();

  let record: {
    id: number;
    title: string;
    attendees: string;
    meetingDate: Date;
    rawMinutes: string;
    extractedActions: string;
    actionsCount: number;
    status: string;
    createdAt: Date;
    project: { id: number; name: string } | null;
  } | null = null;

  try {
    record = await db.uc3MeetingMinutes.findFirst({
      where: { id: minutesId, tenantId },
      select: {
        id: true,
        title: true,
        attendees: true,
        meetingDate: true,
        rawMinutes: true,
        extractedActions: true,
        actionsCount: true,
        status: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
      },
    });
  } catch {
    // graceful
  }

  if (!record) notFound();

  let actions: ExtractedAction[] = [];
  try {
    const parsed = JSON.parse(record.extractedActions);
    if (Array.isArray(parsed)) actions = parsed as ExtractedAction[];
  } catch {
    // invalid JSON — leave empty
  }

  const confirmAction = confirmMeetingMinutes.bind(null, minutesId);

  return (
    <div className="pb-16">
      <PageHeader
        title={record.title || "(untitled meeting)"}
        subtitle={record.project ? `Project: ${record.project.name}` : undefined}
        actions={[
          { href: "/uc3/meeting-minutes", label: "Back to Minutes", variant: "outline" },
        ]}
      />

      <div className="px-8 space-y-6">
        {/* Status banner for processed records awaiting confirmation */}
        {record.status === "processed" && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-800">Awaiting Confirmation</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Review the extracted actions below, then confirm to finalise these minutes.
              </p>
            </div>
            <form action={confirmAction}>
              <button type="submit" className="btn-ae text-sm whitespace-nowrap">
                Confirm Minutes
              </button>
            </form>
          </div>
        )}

        {record.status === "confirmed" && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            These minutes have been confirmed.
          </div>
        )}

        {/* Metadata card */}
        <div className="ae-card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-neutral-400 mb-1">Meeting Date</div>
            <div>{formatDate(record.meetingDate)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">Status</div>
            <div>
              <StatusBadge status={record.status} />
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">Actions Extracted</div>
            <div className="font-semibold">{record.actionsCount}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">Recorded</div>
            <div>{formatDate(record.createdAt)}</div>
          </div>
        </div>

        {/* Attendees */}
        {record.attendees && (
          <div className="ae-card p-5">
            <h2 className="text-sm font-semibold text-neutral-700 mb-2">Attendees</h2>
            <p className="text-sm text-neutral-600">{record.attendees}</p>
          </div>
        )}

        {/* Extracted Actions Table */}
        {actions.length > 0 && (
          <div className="ae-card overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <h2 className="font-semibold text-sm">Extracted Action Items</h2>
              <span className="text-xs text-neutral-500">{actions.length} item{actions.length !== 1 ? "s" : ""}</span>
            </div>
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Action</th>
                  <th>Owner</th>
                  <th>Due Date</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action, idx) => (
                  <tr key={idx}>
                    <td className="text-neutral-400 text-xs w-8">{idx + 1}</td>
                    <td className="font-medium text-sm">{action.action ?? "—"}</td>
                    <td className="text-neutral-600 text-sm">{action.owner ?? "—"}</td>
                    <td className="text-neutral-500 text-sm">
                      {action.due_date ? formatDate(action.due_date) : "—"}
                    </td>
                    <td className="text-neutral-500 text-sm">{action.priority ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {actions.length === 0 && record.status !== "raw" && (
          <div className="ae-card p-5 text-sm text-neutral-500">
            No action items were extracted from these minutes.
          </div>
        )}

        {record.status === "raw" && (
          <div className="ae-card p-5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
            These minutes have not been processed yet. Action items will appear here once AI
            processing is complete.
          </div>
        )}

        {/* Raw Minutes */}
        <div className="ae-card overflow-hidden">
          <details open={actions.length === 0}>
            <summary className="px-5 py-3 cursor-pointer font-semibold text-sm text-neutral-700 hover:bg-neutral-50 select-none border-b border-neutral-200 dark:border-neutral-700">
              Raw Minutes
            </summary>
            <div className="px-5 py-4">
              <pre className="whitespace-pre-wrap text-sm text-neutral-700 font-mono leading-relaxed">
                {record.rawMinutes}
              </pre>
            </div>
          </details>
        </div>

        {/* Confirm form (bottom) — only shown if status=processed */}
        {record.status === "processed" && (
          <div className="ae-card p-5 flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-600">
              Happy with the extracted actions? Confirm these minutes to lock them in.
            </p>
            <form action={confirmAction}>
              <button type="submit" className="btn-ae">
                Confirm Minutes
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
