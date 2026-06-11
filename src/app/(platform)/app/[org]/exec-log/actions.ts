"use server";

// Approval gate for AI-proposed writes — approving performs the deferred
// write through the record writer (the step UC2/UC3 never executed).

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { executeProposal, rejectProposal } from "@/lib/platform/recordWriter";

async function ctxFrom(formData: FormData) {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const execLogId = Number(formData.get("execLogId"));
  return { ctx, user, execLogId };
}

export async function approveProposalAction(formData: FormData): Promise<void> {
  const { ctx, user, execLogId } = await ctxFrom(formData);
  if (!execLogId) return;
  try {
    await executeProposal(ctx, execLogId, user.name);
  } catch {
    // Failure is recorded on the log row itself (status "failed").
  }
  revalidatePath(orgPath(ctx.orgSlug, "/exec-log"));
  revalidatePath(orgPath(ctx.orgSlug));
}

export async function rejectProposalAction(formData: FormData): Promise<void> {
  const { ctx, user, execLogId } = await ctxFrom(formData);
  if (!execLogId) return;
  try {
    await rejectProposal(ctx, execLogId, user.name, String(formData.get("reason") ?? ""));
  } catch {
    /* already resolved */
  }
  revalidatePath(orgPath(ctx.orgSlug, "/exec-log"));
  revalidatePath(orgPath(ctx.orgSlug));
}
