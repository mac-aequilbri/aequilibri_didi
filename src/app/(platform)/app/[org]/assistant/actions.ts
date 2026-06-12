"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { executeProposal, rejectProposal } from "@/lib/platform/recordWriter";
import { endSession, sendChatMessage } from "@/services/platform/assistant/chat";

export interface SendMessageState {
  ok: boolean;
  error?: string;
}

export async function sendMessageAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const text = String(formData.get("message") ?? "").trim();
  if (!text) return;
  const user = await getCurrentUser(ctx);
  const sessionId = Number(formData.get("sessionId")) || undefined;
  await sendChatMessage(ctx, user.name, text, { sessionId });
  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
}

export async function resetSessionAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const sessionId = Number(formData.get("sessionId"));
  if (sessionId) await endSession(ctx, sessionId);
  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
}

export async function approveFromChatAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const proposalId = Number(formData.get("proposalId"));
  if (proposalId) {
    try {
      await executeProposal(ctx, proposalId, user.name);
    } catch {
      /* recorded as failed/expired on the pending row */
    }
  }
  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
}

export async function rejectFromChatAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const proposalId = Number(formData.get("proposalId"));
  if (proposalId) {
    try {
      await rejectProposal(ctx, proposalId, user.name);
    } catch {
      /* already resolved */
    }
  }
  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
}
