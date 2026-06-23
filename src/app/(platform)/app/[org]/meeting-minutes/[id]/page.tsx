// Minutes detail — review extracted actions; confirming creates real
// Action Hub rows (sourceType=meeting_minutes). Reads through loadMinutesDetail
// so the Postgres → Airtable swap is invisible; the id is numeric (Postgres) or
// a "rec…" id (Airtable) and the confirm form posts it back RecordId-aware.

import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { loadMinutesDetail } from "@/lib/platform/minutesDetailSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { confirmMinutesAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MinutesDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const minutes = await loadMinutesDetail(ctx, id);
  if (!minutes) notFound();

  const meetingDateLabel = minutes.meetingDate ? formatDate(minutes.meetingDate) : "—";
  const actions = minutes.extractedActions;

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title={minutes.title || `Meeting ${meetingDateLabel}`}
        subtitle={`${minutes.jobCode ? `${minutes.jobCode} · ` : ""}${meetingDateLabel}${minutes.attendees ? ` · ${minutes.attendees}` : ""}`}
        actions={[{ href: orgPath(ctx.orgSlug, "/meeting-minutes"), label: "All minutes", variant: "outline" }]}
      />

      <div className="ae-card p-5 space-y-4">
        <StatusBadge status={minutes.status} />

        <div>
          <h2 className="font-semibold text-sm mb-2">
            Extracted actions ({actions.length})
            {minutes.status === "processed" && (
              <span className="font-normal text-xs text-neutral-500"> — not yet created</span>
            )}
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {actions.map((a, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="py-1.5 pr-2">{a.title}</td>
                  <td className="py-1.5 pr-2 text-xs text-neutral-500 whitespace-nowrap">
                    {a.owner || "—"}
                  </td>
                  <td className="py-1.5 text-xs text-neutral-500 whitespace-nowrap">
                    {a.dueDate ?? "no due date"}
                  </td>
                </tr>
              ))}
              {actions.length === 0 && (
                <tr>
                  <td className="py-3 text-sm text-neutral-500">
                    No actions extracted{minutes.status === "raw" ? " (demo mode or extraction failed)" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {minutes.status === "processed" && actions.length > 0 && (
          <form action={confirmMinutesAction}>
            <input type="hidden" name="org" value={ctx.orgSlug} />
            <input type="hidden" name="recordId" value={minutes.id} />
            <button type="submit" className="btn-ae">
              Confirm — create {actions.length} action{actions.length === 1 ? "" : "s"}
            </button>
          </form>
        )}
        {minutes.status === "confirmed" && (
          <p className="text-xs text-emerald-700">
            Confirmed {minutes.confirmedAt ? formatDate(minutes.confirmedAt) : ""} — actions created in the Action Hub.
          </p>
        )}

        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer">Raw minutes</summary>
          <pre className="mt-2 whitespace-pre-wrap">{minutes.rawMinutes}</pre>
        </details>
      </div>
    </div>
  );
}
