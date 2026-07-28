// PLAN task-level schedule (Spec 12 Core / Module 5 construct 5) — the first
// read/write wiring of the PLAN table (docs/spec12-lock-plan.md §5.2). Airtable-
// only, like COMMS: PLAN has no Postgres model, so reads come from the org's
// base when AIRTABLE_MIGRATION is on and an empty list otherwise.
//
// Predecessor links are read (they drive the L5 Gantt) but not edited by the
// app yet — the onboarding playbook's "second pass" for self-referencing links
// still happens in Airtable until the Gantt view lands.

import { airtableEnabled, core } from "@/lib/airtable";
import { loadJobLabelMap } from "./jobOptionsSource";
import { recordInScope, scopeByJob } from "./rls";
import { dateInput, type EditorValues } from "./recordEditor";
import type { OrgCtx } from "./types";

export interface PlanTaskView {
  id: string;
  name: string;
  jobId: string | null;
  jobName: string | null;
  phaseId: string | null;
  phaseName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  durationDays: number;
  /** Canonical PLAN status (vocab.ts): Not Started · In Progress · Complete ·
   *  Blocked · Deferred. */
  status: string;
  rag: string;
  /** Resolved CONTACTS name(s) for the Assigned_To link, "" when unassigned. */
  assignedTo: string;
  predecessorIds: string[];
  notes: string;
  /** Derived: past its end date and not Complete. */
  isOverdue: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
function firstLink(v: unknown): string | null {
  return Array.isArray(v) && v.length > 0 ? String(v[0]) : null;
}
function linkIds(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter((s) => s.startsWith("rec")) : [];
}

/** Phase rec id → phase name, tolerant of the read failing on older bases. */
async function loadPhaseLabelMap(ctx: OrgCtx): Promise<Map<string, string>> {
  try {
    const rows = await core.list(ctx.orgSlug, "PHASES", { maxRecords: 500 });
    return new Map(rows.map((p) => [p.id, str(p["Phase_Name"]) || "(phase)"]));
  } catch {
    return new Map();
  }
}

/** Contact rec id → contact name, for resolving Assigned_To links. */
async function loadContactLabelMap(ctx: OrgCtx): Promise<Map<string, string>> {
  try {
    const rows = await core.list(ctx.orgSlug, "CONTACTS", { maxRecords: 500 });
    return new Map(rows.map((c) => [c.id, str(c["Contact_Name"]) || "(contact)"]));
  } catch {
    return new Map();
  }
}

/** Load the task schedule from the active backend (Airtable, or []) — RLS-
 *  scoped to the viewer's assigned jobs. Ordered by start date (unset last). */
export async function loadPlanTasks(ctx: OrgCtx): Promise<PlanTaskView[]> {
  if (!airtableEnabled(ctx)) return [];
  const [rows, jobLabels, phaseLabels, contactLabels] = await Promise.all([
    core.list(ctx.orgSlug, "PLAN", { maxRecords: 1000 }),
    loadJobLabelMap(ctx),
    loadPhaseLabelMap(ctx),
    loadContactLabelMap(ctx),
  ]);
  const now = Date.now();
  const items = rows.map((r) => {
    const startRaw = str(r["Start_Date"]);
    const endRaw = str(r["End_Date"]);
    const startDate = startRaw ? new Date(startRaw) : null;
    const endDate = endRaw ? new Date(endRaw) : null;
    const status = str(r["Status"]) || "Not Started";
    const jobId = firstLink(r["Job"]);
    const phaseId = firstLink(r["Phase"]);
    const assignees = linkIds(r["Assigned_To"]).map((id) => contactLabels.get(id) ?? "");
    return {
      id: r.id,
      name: str(r["Task_Name"]) || "(task)",
      jobId,
      jobName: jobId ? (jobLabels.get(jobId) ?? null) : null,
      phaseId,
      phaseName: phaseId ? (phaseLabels.get(phaseId) ?? null) : null,
      startDate,
      endDate,
      durationDays: num(r["Duration_Days"]),
      status,
      rag: str(r["RAG"]),
      assignedTo: assignees.filter(Boolean).join(", "),
      predecessorIds: linkIds(r["Predecessor"]),
      notes: str(r["Notes"]),
      isOverdue: status !== "Complete" && !!endDate && endDate.getTime() < now,
    };
  });
  const sorted = items.sort((a, b) => {
    const at = a.startDate?.getTime() ?? Infinity;
    const bt = b.startDate?.getTime() ?? Infinity;
    if (at !== bt) return at - bt;
    return a.name.localeCompare(b.name);
  });
  return scopeByJob(ctx, sorted, (t) => t.jobId);
}

/** Form-ready values for a single task's detail/edit page. Airtable-only, so
 *  null unless Airtable mode is active (matching loadCommDetail). */
export async function loadPlanTaskDetail(ctx: OrgCtx, id: string): Promise<EditorValues | null> {
  if (!airtableEnabled(ctx)) return null;
  let r: Record<string, unknown> | null = null;
  try {
    r = await core.get(ctx.orgSlug, "PLAN", id);
  } catch {
    return null;
  }
  if (!r) return null;
  if (!(await recordInScope(ctx, r))) return null;
  return {
    name: str(r["Task_Name"]),
    status: str(r["Status"]) || "Not Started",
    rag: str(r["RAG"]),
    startDate: dateInput(str(r["Start_Date"]) || null),
    endDate: dateInput(str(r["End_Date"]) || null),
    durationDays: num(r["Duration_Days"]),
    notes: str(r["Notes"]),
  };
}
