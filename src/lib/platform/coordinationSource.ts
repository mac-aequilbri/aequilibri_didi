import { orgPath } from "@/lib/platform/paths";
import { loadActions } from "./actionsSource";
import { loadComms } from "./commsSource";
import { loadPendingWrites } from "./pendingWritesSource";
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
}

export async function loadCoordinationQueue(ctx: OrgCtx): Promise<CoordinationItemView[]> {
  const [actionsData, risks, pendingWrites, comms] = await Promise.all([
    loadActions(ctx),
    loadRisks(ctx),
    loadPendingWrites(ctx),
    loadComms(ctx),
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
    });
  }

  const proposalCount = pendingWrites.filter((w) => w.status === "proposed").length;
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
