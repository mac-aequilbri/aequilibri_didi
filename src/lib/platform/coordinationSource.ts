import { orgPath } from "@/lib/platform/paths";
import { loadActions } from "./actionsSource";
import { loadCascadeAdvisories } from "./cascade";
import { loadComms } from "./commsSource";
import { loadPlanTasks } from "./planSource";
import { loadProposedPendingCount } from "./pendingWritesSource";
import {
  comparePriority,
  priorityBandForActionDueDate,
  priorityBandForRiskScore,
  strongerBand,
} from "./projectIntelligence";
import type { PriorityBand } from "./projectIntelligence";
import { loadRisks } from "./risksSource";
import type { OrgCtx } from "./types";

export interface CoordinationItemView {
  id: string;
  title: string;
  detail: string;
  priority: PriorityBand;
  href: string;
  /** Who this item sits with (Assigned_To / owner) — drives the M8
   *  Coordination Dashboard's group-by-assignee view. "" = unassigned. */
  assignee?: string;
  /** Inline quick-action (lock decision D-10: ISSUES status and COMMS status
   *  only, as plain role-gated server actions). */
  quick?: { kind: "action" | "comms"; recordId: string };
  /** Cascade advisories only (Spec 12 Module 5 rules A/B/C/E): the
   *  EXECUTION_LOG record id the dismiss actions target. */
  cascadeId?: string;
}

export async function loadCoordinationQueue(ctx: OrgCtx): Promise<CoordinationItemView[]> {
  const [actionsData, risks, proposalCount, comms, advisories, planTasks] = await Promise.all([
    loadActions(ctx),
    loadRisks(ctx),
    // Proposed count only — shares one cached filtered read with the nav
    // badges and dashboard instead of pulling the full approval history.
    loadProposedPendingCount(ctx),
    loadComms(ctx),
    loadCascadeAdvisories(ctx),
    loadPlanTasks(ctx),
  ]);

  const p = (path: string) => orgPath(ctx.orgSlug, path);
  const items: CoordinationItemView[] = [];

  for (const action of actionsData.items) {
    if (action.status === "done" || action.status === "deferred") continue;
    const priority = strongerBand(
      priorityBandForActionDueDate(action.dueDate),
      action.priority.toLowerCase() === "high" ? "HIGH" : "LOW",
    );
    if (priority === "LOW") continue;
    items.push({
      id: `action:${action.id}`,
      title: action.title,
      detail: action.dueDate ? `Action due ${action.dueDate.toISOString().slice(0, 10)}` : "Open action",
      priority,
      href: p("/actions"),
      assignee: action.owner || "",
      quick: { kind: "action", recordId: action.id },
    });
  }

  for (const risk of risks) {
    if (risk.status === "mitigated" || risk.status === "closed") continue;
    const score = risk.likelihood * risk.impact;
    const priority = priorityBandForRiskScore(score);
    if (priority === "LOW") continue;
    items.push({
      id: `risk:${risk.id}`,
      title: risk.description,
      detail: `Risk score ${score} (L${risk.likelihood}×I${risk.impact})`,
      priority,
      href: p("/risks"),
    });
  }

  for (const c of comms) {
    if (c.status === "sent" || c.status === "acknowledged") continue;
    const priority = strongerBand(
      priorityBandForActionDueDate(c.dueDate),
      c.isOverdue ? "URGENT" : "LOW",
    );
    if (priority === "LOW") continue;
    items.push({
      id: `comms:${c.id}`,
      title: c.topic,
      detail: `${c.messageType} → ${c.stakeholderRole}${c.isOverdue ? " (overdue)" : c.dueDate ? ` due ${c.dueDate.toISOString().slice(0, 10)}` : ""}`,
      priority,
      href: p("/comms"),
      assignee: c.sentBy || "",
      quick: { kind: "comms", recordId: c.id },
    });
  }

  // PLAN tasks (Spec 12 M8 Coordination Dashboard: tasks Not Started /
  // In Progress by due date). Overdue tasks are urgent; imminent ones surface.
  for (const t of planTasks) {
    if (!["Not Started", "In Progress", "Blocked"].includes(t.status)) continue;
    const priority = strongerBand(
      priorityBandForActionDueDate(t.endDate),
      t.isOverdue || t.status === "Blocked" ? "URGENT" : "LOW",
    );
    if (priority === "LOW") continue;
    items.push({
      id: `plan:${t.id}`,
      title: t.name,
      detail: `Plan task${t.phaseName ? ` · ${t.phaseName}` : ""}${t.endDate ? ` ends ${t.endDate.toISOString().slice(0, 10)}` : ""}${t.isOverdue ? " (overdue)" : ""}`,
      priority,
      href: p("/plan"),
      assignee: t.assignedTo || "",
    });
  }

  // Cascade advisories (Spec 12 Module 5 "review X" rules) — stay in the queue
  // until dismissed on the coordination page.
  for (const a of advisories) {
    items.push({
      id: `cascade:${a.id}`,
      title: a.message || `Cascade advisory ${a.ruleCode}`,
      detail: `${a.ruleCode} — triggered by a ${a.table} change${a.createdAt ? ` on ${a.createdAt.slice(0, 10)}` : ""}`,
      priority: "MED",
      href: p("/coordination"),
      cascadeId: a.id,
    });
  }

  if (proposalCount > 0) {
    items.push({
      id: "approvals:pending",
      title: `${proposalCount} proposal${proposalCount === 1 ? "" : "s"} awaiting decision`,
      detail: "Pending AI or automated changes require explicit approval.",
      priority: proposalCount > 5 ? "URGENT" : "HIGH",
      href: p("/approvals"),
    });
  }

  return items
    .sort((a, b) => comparePriority(a.priority, b.priority))
    .slice(0, 30);
}
