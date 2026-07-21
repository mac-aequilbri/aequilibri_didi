"use server";

import { redirect } from "next/navigation";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam } from "@/lib/platform/recordWriter";
import {
  createChatSession,
  deleteChatSession,
  isChatSession,
  renameChatSession,
} from "@/services/platform/assistant/chat";

/** Open a fresh standalone conversation and switch to it. */
export async function newChatAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  if (!ctx.config.features.chat) redirect(orgPath(ctx.orgSlug, ""));
  const id = await createChatSession(ctx);
  redirect(`${orgPath(ctx.orgSlug, "/chat")}?s=${id}`);
}

/** Rename a conversation. No-ops (and stays put) on a blank name or an id that
 *  isn't one of this org's conversations. */
export async function renameChatAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  if (!ctx.config.features.chat) redirect(orgPath(ctx.orgSlug, ""));
  const id = recordIdParam(formData.get("sessionId"));
  const title = String(formData.get("title") ?? "").trim();
  if (id && title && (await isChatSession(ctx, id))) {
    await renameChatSession(ctx, id, title);
  }
  redirect(id ? `${orgPath(ctx.orgSlug, "/chat")}?s=${id}` : orgPath(ctx.orgSlug, "/chat"));
}

/** Permanently delete a conversation (and its messages), then land on whichever
 *  conversation is resolved next. Ignores ids not owned by this org. */
export async function deleteChatAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  if (!ctx.config.features.chat) redirect(orgPath(ctx.orgSlug, ""));
  const id = recordIdParam(formData.get("sessionId"));
  if (id && (await isChatSession(ctx, id))) {
    await deleteChatSession(ctx, id);
  }
  redirect(orgPath(ctx.orgSlug, "/chat"));
}
