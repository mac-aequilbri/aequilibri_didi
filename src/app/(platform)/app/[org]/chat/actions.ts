"use server";

import { redirect } from "next/navigation";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { createChatSession } from "@/services/platform/assistant/chat";

/** Open a fresh standalone conversation and switch to it. */
export async function newChatAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  if (!ctx.config.features.chat) redirect(orgPath(ctx.orgSlug, ""));
  const id = await createChatSession(ctx);
  redirect(`${orgPath(ctx.orgSlug, "/chat")}?s=${id}`);
}
