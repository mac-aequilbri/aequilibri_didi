"use server";

// Approval gate for AI-proposed writes — approving performs the deferred
// write through the record writer (the step UC2/UC3 never executed).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { executeProposal, recordIdParam, rejectProposal } from "@/lib/platform/recordWriter";
import { canApprove } from "@/lib/platform/roles";

async function ctxFrom(formData: FormData) {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const proposalId = recordIdParam(formData.get("proposalId"));
  // Governance §2.2 Approve column (FLS): resolving a proposal requires
  // Approve rights on its table — same gate as the Approvals inbox.
  if (proposalId != null) {
    const pending = (await loadPendingWrites(ctx)).find((p) => String(p.id) === String(proposalId));
    if (pending && !canApprove(user.role, pending.tableKey)) {
      throw new Error(`Your role cannot resolve ${pending.tableKey} proposals.`);
    }
  }
  return { ctx, user, proposalId };
}

export async function approveProposalAction(formData: FormData): Promise<void> {
  const { ctx, user, proposalId } = await ctxFrom(formData);
  if (!proposalId) return;
  try {
    await executeProposal(ctx, proposalId, user.name);
  } catch {
    // Failure/expiry is recorded on the pending row — surface it to the user.
    revalidatePath(orgPath(ctx.orgSlug, "/exec-log"));
    revalidatePath(orgPath(ctx.orgSlug));
    redirect(orgPath(ctx.orgSlug, "/exec-log?error=approve_failed"));
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
