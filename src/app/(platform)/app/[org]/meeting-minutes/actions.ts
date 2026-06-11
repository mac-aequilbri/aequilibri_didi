"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import {
  confirmMeetingMinutes,
  processMeetingMinutes,
} from "@/services/platform/construction/minutes";

export async function processMinutesAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = Number(formData.get("jobId"));
  const rawMinutes = String(formData.get("rawMinutes") ?? "").trim();
  if (!jobId || !rawMinutes) return;
  const { id } = await processMeetingMinutes(ctx, user.name, {
    jobId,
    meetingDate: String(formData.get("meetingDate") ?? "") || new Date().toISOString().slice(0, 10),
    title: String(formData.get("title") ?? ""),
    attendees: String(formData.get("attendees") ?? ""),
    rawMinutes,
  });
  revalidatePath(orgPath(ctx.orgSlug, "/meeting-minutes"));
  redirect(orgPath(ctx.orgSlug, id ? `/meeting-minutes/${id}` : "/meeting-minutes"));
}

export async function confirmMinutesAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const id = Number(formData.get("recordId"));
  if (!id) return;
  await confirmMeetingMinutes(ctx, user.name, id);
  revalidatePath(orgPath(ctx.orgSlug, `/meeting-minutes/${id}`));
  revalidatePath(orgPath(ctx.orgSlug, "/meeting-minutes"));
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
}
