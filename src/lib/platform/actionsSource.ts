// Action Hub data source — Postgres (default) or the canonical Airtable
// ACTION_HUB table when AIRTABLE_MIGRATION is enabled. Returns a uniform view
// model + metrics so the page is identical regardless of backend. Same pattern
// as decisionsSource.ts.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
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
  status: string;
}

export interface ActionsData {
  items: ActionView[];
  metrics: { open: number; overdue: number; fromChat: number };
}

const STATUSES = ["open", "in_progress", "done", "deferred"] as const;
type AppStatus = (typeof STATUSES)[number];

function validStatus(s: string | undefined): s is AppStatus {
  return !!s && (STATUSES as readonly string[]).includes(s);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fromPostgres(ctx: OrgCtx, status?: string): Promise<ActionsData> {
  const where = { orgId: ctx.orgId, ...(validStatus(status) ? { status } : {}) };
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
    })),
    metrics: { open, overdue, fromChat },
  };
}

const AIR_TO_APP_STATUS: Record<string, AppStatus> = {
  Open: "open",
  "In Progress": "in_progress",
  Complete: "done",
  Deferred: "deferred",
};

async function fromAirtable(ctx: OrgCtx, status?: string): Promise<ActionsData> {
  const rows = await core.list(ctx.orgSlug, "ACTION_HUB", { maxRecords: 200 });
  const now = Date.now();
  const all: ActionView[] = rows.map((r) => {
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
      status: AIR_TO_APP_STATUS[str(r["Status"])] ?? "open",
    };
  });
  const isOpen = (a: ActionView) => a.status === "open" || a.status === "in_progress";
  const metrics = {
    open: all.filter(isOpen).length,
    overdue: all.filter((a) => isOpen(a) && a.dueDate !== null && a.dueDate.getTime() < now).length,
    fromChat: 0, // Airtable ACTION_HUB has no source channel
  };
  const items = validStatus(status) ? all.filter((a) => a.status === status) : all;
  return { items, metrics };
}

/** Load actions + headline metrics from whichever backend is active. */
export function loadActions(ctx: OrgCtx, status?: string): Promise<ActionsData> {
  return airtableEnabled() ? fromAirtable(ctx, status) : fromPostgres(ctx, status);
}
