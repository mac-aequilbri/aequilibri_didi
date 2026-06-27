// COMMS coordination layer (Spec 10 Core) — "who gets told what, by when".
// Airtable-only: COMMS has no Postgres model (like ASSESSMENTS), so reads come
// from the org's base when AIRTABLE_MIGRATION is on, and an empty list otherwise.

import { airtableEnabled, core } from "@/lib/airtable";
import type { OrgCtx } from "./types";

export interface CommView {
  id: string;
  topic: string;
  messageType: string;
  stakeholderRole: string;
  /** Lower-cased app status: pending | sent | acknowledged | overdue. */
  status: string;
  dueDate: Date | null;
  sentBy: string;
  notes: string;
  jobId: string | null;
  stakeholderId: string | null;
  /** Derived: still pending and past its due date. */
  isOverdue: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function firstLink(v: unknown): string | null {
  return Array.isArray(v) && v.length > 0 ? String(v[0]) : null;
}

/** Load the coordination schedule from the active backend (Airtable, or []). */
export async function loadComms(ctx: OrgCtx): Promise<CommView[]> {
  if (!airtableEnabled()) return [];
  const rows = await core.list(ctx.orgSlug, "COMMS", { maxRecords: 300 });
  const now = Date.now();
  const items = rows.map((r) => {
    const dueRaw = str(r["Due_Date"]);
    const dueDate = dueRaw ? new Date(dueRaw) : null;
    const status = (str(r["Status"]) || "pending").toLowerCase();
    return {
      id: r.id,
      topic: str(r["Topic"]) || "(untitled)",
      messageType: str(r["Message_Type"]) || "Status Update",
      stakeholderRole: str(r["Stakeholder_Role"]) || "Owner",
      status,
      dueDate,
      sentBy: str(r["Sent_By"]),
      notes: str(r["Notes"]),
      jobId: firstLink(r["Job"]),
      stakeholderId: firstLink(r["Stakeholder"]),
      isOverdue: status === "pending" && !!dueDate && dueDate.getTime() < now,
    };
  });
  // Forward-looking schedule: soonest-due pending first, sent/acknowledged last.
  return items.sort((a, b) => {
    const done = (s: string) => (s === "sent" || s === "acknowledged" ? 1 : 0);
    if (done(a.status) !== done(b.status)) return done(a.status) - done(b.status);
    const at = a.dueDate?.getTime() ?? Infinity;
    const bt = b.dueDate?.getTime() ?? Infinity;
    return at - bt;
  });
}
