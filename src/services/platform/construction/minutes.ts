// Meeting minutes — AI extraction of action items, human confirmation
// creates real Action Hub rows (sourceType=meeting_minutes).

import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord } from "@/lib/platform/recordWriter";
import { OrgCtx } from "@/lib/platform/types";

export interface ExtractedAction {
  title: string;
  owner: string;
  dueDate: string | null;
}

export async function processMeetingMinutes(
  ctx: OrgCtx,
  userName: string,
  input: { jobId: number; meetingDate: string; title: string; attendees: string; rawMinutes: string },
): Promise<{ id?: number; actionsCount: number; demoMode: boolean }> {
  const { system } = getPrompt("minutes.extract");
  const res = await callClaude(system, input.rawMinutes.slice(0, 12000), {
    model: modelFor("extraction"),
    maxTokens: 1200,
  });

  let actions: ExtractedAction[] = [];
  if (!res.demo_mode) {
    try {
      const parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
      if (Array.isArray(parsed.actions)) {
        actions = parsed.actions
          .filter((a: unknown) => a && typeof a === "object" && (a as { title?: unknown }).title)
          .map((a: { title: unknown; owner?: unknown; dueDate?: unknown }) => ({
            title: String(a.title).slice(0, 300),
            owner: String(a.owner ?? "").slice(0, 200),
            dueDate: a.dueDate && /^\d{4}-\d{2}-\d{2}/.test(String(a.dueDate)) ? String(a.dueDate) : null,
          }));
      }
    } catch {
      actions = [];
    }
  }

  const result = await writeRecord(ctx, {
    table: "meeting_minutes",
    op: "create",
    data: {
      jobId: input.jobId,
      meetingDate: input.meetingDate,
      title: input.title,
      attendees: input.attendees,
      rawMinutes: input.rawMinutes,
      extractedActions: JSON.stringify(actions),
      actionsCount: actions.length,
      status: res.demo_mode ? "raw" : "processed",
    },
    actor: { type: "human", name: userName },
  });
  return { id: result.recordId, actionsCount: actions.length, demoMode: res.demo_mode };
}

/** Human gate: confirming the minutes creates the extracted actions for real. */
export async function confirmMeetingMinutes(
  ctx: OrgCtx,
  userName: string,
  id: number,
): Promise<number> {
  const minutes = await prisma.platConMeetingMinutes.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!minutes || minutes.status === "confirmed") return 0;

  let actions: ExtractedAction[] = [];
  try {
    actions = JSON.parse(minutes.extractedActions);
  } catch {
    actions = [];
  }

  let created = 0;
  for (const a of actions) {
    if (!a.title) continue;
    await writeRecord(ctx, {
      table: "action",
      op: "create",
      data: {
        jobId: minutes.jobId,
        title: a.title,
        owner: a.owner,
        dueDate: a.dueDate ?? undefined,
        sourceType: "meeting_minutes",
        sourceId: minutes.id,
      },
      actor: { type: "human", name: userName },
    });
    created++;
  }

  await writeRecord(ctx, {
    table: "meeting_minutes",
    op: "update",
    recordId: minutes.id,
    data: { status: "confirmed", confirmedAt: new Date().toISOString(), actionsCount: created },
    actor: { type: "human", name: userName },
  });
  return created;
}
