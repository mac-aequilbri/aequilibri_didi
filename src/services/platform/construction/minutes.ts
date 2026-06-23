// Meeting minutes — AI extraction of action items, human confirmation
// creates real Action Hub rows (sourceType=meeting_minutes).

import { airtableEnabled, core } from "@/lib/airtable";
import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord, type RecordId } from "@/lib/platform/recordWriter";
import { OrgCtx } from "@/lib/platform/types";

export interface ExtractedAction {
  title: string;
  owner: string;
  dueDate: string | null;
}

function parseActions(raw: unknown): ExtractedAction[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExtractedAction[]) : [];
  } catch {
    return [];
  }
}

/** Create one Action Hub row per extracted action, then stamp the minutes
 *  record confirmed. Shared by both backends; jobId is whatever link the
 *  minutes carried (dropped by the ACTION_HUB map in Airtable mode, which has
 *  no Job link). Returns the number of actions created. */
async function createActionsAndConfirm(
  ctx: OrgCtx,
  userName: string,
  minutesId: RecordId,
  jobId: RecordId | undefined,
  actions: ExtractedAction[],
): Promise<number> {
  let created = 0;
  for (const a of actions) {
    if (!a.title) continue;
    await writeRecord(ctx, {
      table: "action",
      op: "create",
      data: {
        jobId,
        title: a.title,
        owner: a.owner,
        dueDate: a.dueDate ?? undefined,
        sourceType: "meeting_minutes",
        sourceId: minutesId,
      },
      actor: { type: "human", name: userName },
    });
    created++;
  }
  await writeRecord(ctx, {
    table: "meeting_minutes",
    op: "update",
    recordId: minutesId,
    data: { status: "confirmed", confirmedAt: new Date().toISOString(), actionsCount: created },
    actor: { type: "human", name: userName },
  });
  return created;
}

export async function processMeetingMinutes(
  ctx: OrgCtx,
  userName: string,
  input: { jobId: number; meetingDate: string; title: string; attendees: string; rawMinutes: string },
): Promise<{ id?: RecordId; actionsCount: number; demoMode: boolean }> {
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
  id: RecordId,
): Promise<number> {
  if (airtableEnabled()) {
    const m = await core.get(ctx.orgSlug, "MEETING_MINUTES", String(id)).catch(() => null);
    if (!m || m["Status"] === "confirmed") return 0;
    const jobLink = m["Job"];
    const jobId = Array.isArray(jobLink) && jobLink.length ? String(jobLink[0]) : undefined;
    return createActionsAndConfirm(ctx, userName, id, jobId, parseActions(m["Extracted_Actions"]));
  }

  const minutes = await prisma.platConMeetingMinutes.findFirst({
    where: { id: Number(id), orgId: ctx.orgId },
  });
  if (!minutes || minutes.status === "confirmed") return 0;

  return createActionsAndConfirm(
    ctx,
    userName,
    minutes.id,
    minutes.jobId,
    parseActions(minutes.extractedActions),
  );
}
