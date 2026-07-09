// Action Hub data source — Postgres (default) or the canonical Airtable
// ACTION_HUB table when AIRTABLE_MIGRATION is enabled. Returns a uniform view
// model + metrics so the page is identical regardless of backend. Same pattern
// as decisionsSource.ts.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import {
  ACTION_STATUSES,
  isAppStatus,
  resolveActionStatus,
  suggestStatus,
  type AppStatus,
} from "./actionStatus";
import { loadActionStatusMap } from "./configSource";
import type { OrgCtx } from "./types";

export interface ActionView {
  id: string;
  title: string;
  detail: string;
  jobCode: string | null;
  owner: string;
  dueDate: Date | null;
  priority: string;
  sourceType: string;
  /** Canonical status, or "unmapped" when the raw value isn't recognised. */
  status: string;
  /** The raw Airtable Status value, preserved for display/mapping. */
  rawStatus: string;
  /** True when the raw value has no known/ mapped canonical — flagged for cleanup. */
  needsMapping: boolean;
  /** Spec 10 ISSUES classifier (Airtable Issue_Type); "" on the Postgres path. */
  issueType: string;
}

/** A distinct unrecognised raw status + how many rows carry it + a suggested
 *  canonical status to prefill the mapping UI. */
export interface UnmappedStatus {
  raw: string;
  count: number;
  suggestion: AppStatus | null;
}

export interface ActionsData {
  items: ActionView[];
  metrics: { open: number; overdue: number; fromChat: number; needsMapping: number };
  unmapped: UnmappedStatus[];
}

/** A status the list can be filtered to: a canonical status or "unmapped". */
function filterItems(all: ActionView[], status?: string): ActionView[] {
  if (!status) return all;
  if (status === "unmapped") return all.filter((a) => a.needsMapping);
  if (isAppStatus(status)) return all.filter((a) => !a.needsMapping && a.status === status);
  return all;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fromPostgres(ctx: OrgCtx, status?: string): Promise<ActionsData> {
  const where = { orgId: ctx.orgId, ...(status && isAppStatus(status) ? { status } : {}) };
  const [items, open, overdue, fromChat] = await Promise.all([
    prisma.platActionHub.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 200,
      include: { job: { select: { code: true } } },
    }),
    prisma.platActionHub.count({
      where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] } },
    }),
    prisma.platActionHub.count({
      where: {
        orgId: ctx.orgId,
        status: { in: ["open", "in_progress"] },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.platActionHub.count({ where: { orgId: ctx.orgId, sourceType: "chat" } }),
  ]);
  return {
    items: items.map((a) => ({
      id: String(a.id),
      title: a.title,
      detail: a.detail,
      jobCode: a.job?.code ?? null,
      owner: a.owner,
      dueDate: a.dueDate,
      priority: a.priority,
      sourceType: a.sourceType,
      status: a.status,
      rawStatus: a.status, // Postgres statuses are already canonical
      needsMapping: false,
      issueType: "", // no Postgres column — Issue_Type is an Airtable-only field
    })),
    metrics: { open, overdue, fromChat, needsMapping: 0 },
    unmapped: [],
  };
}

async function fromAirtable(ctx: OrgCtx, status?: string): Promise<ActionsData> {
  const [rows, orgMap] = await Promise.all([
    core.list(ctx.orgSlug, "ISSUES", { maxRecords: 1000 }),
    loadActionStatusMap(ctx),
  ]);
  const now = Date.now();
  const all: ActionView[] = rows.map((r) => {
    const raw = str(r["Status"]);
    const res = resolveActionStatus(raw, orgMap);
    const due = str(r["Due_Date"]);
    const owner = r["Assigned_To"];
    return {
      id: r.id,
      title: str(r["Action_Name"]) || "(untitled action)",
      detail: str(r["Description"]),
      jobCode: null,
      owner: Array.isArray(owner) && owner.length > 0 ? "(linked)" : "—",
      dueDate: due ? new Date(due) : null,
      priority: str(r["Priority"]) || "—",
      sourceType: "airtable",
      status: res.canonical ?? "unmapped",
      rawStatus: raw,
      needsMapping: !res.clean,
      issueType: str(r["Issue_Type"]),
    };
  });
  // Only cleanly-resolved rows feed the headline metrics — unmapped values are
  // NOT guessed into "open" (that was the old bug); they surface separately so
  // the user can map them and the count stays trustworthy.
  const isOpen = (a: ActionView) =>
    !a.needsMapping && (a.status === "open" || a.status === "in_progress");
  const metrics = {
    open: all.filter(isOpen).length,
    overdue: all.filter((a) => isOpen(a) && a.dueDate !== null && a.dueDate.getTime() < now).length,
    fromChat: 0, // Airtable ACTION_HUB has no source channel
    needsMapping: all.filter((a) => a.needsMapping).length,
  };
  // Distinct non-blank unmapped raw values, most-common first, with a suggestion.
  const byRaw = new Map<string, number>();
  for (const a of all) {
    if (a.needsMapping && a.rawStatus.trim()) byRaw.set(a.rawStatus, (byRaw.get(a.rawStatus) ?? 0) + 1);
  }
  const unmapped: UnmappedStatus[] = [...byRaw.entries()]
    .map(([raw, count]) => ({ raw, count, suggestion: suggestStatus(raw) }))
    .sort((a, b) => b.count - a.count);

  return { items: filterItems(all, status), metrics, unmapped };
}

/** Load actions + headline metrics from whichever backend is active. */
export function loadActions(ctx: OrgCtx, status?: string): Promise<ActionsData> {
  return airtableEnabled() ? fromAirtable(ctx, status) : fromPostgres(ctx, status);
}
