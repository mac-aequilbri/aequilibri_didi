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
  const proposalId = Number(formData.get("proposalId"));
  return { ctx, user, proposalId };
}

export async function approveProposalAction(formData: FormData): Promise<void> {
  const { ctx, user, proposalId } = await ctxFrom(formData);
  if (!proposalId) return;
  try {
    await executeProposal(ctx, proposalId, user.name);
  } catch {
    // Failure/expiry is recorded on the pending row itself.
  }
  revalidatePath(orgPath(ctx.orgSlug, "/exec-log"));
  revalidatePath(orgPath(ctx.orgSlug));
}

export async function rejectProposalAction(formData: FormData): Promise<void> {
  const { ctx, user, proposalId } = await ctxFrom(formData);
  if (!proposalId) return;
  try {
    await rejectProposal(ctx, proposalId, user.name, String(formData.get("reason") ?? ""));
  } catch {
    /* already resolved */
  }
  revalidatePath(orgPath(ctx.orgSlug, "/exec-log"));
  revalidatePath(orgPath(ctx.orgSlug));
}
