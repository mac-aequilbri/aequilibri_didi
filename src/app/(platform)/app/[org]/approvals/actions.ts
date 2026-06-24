"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { executeProposal, recordIdParam, rejectProposal } from "@/lib/platform/recordWriter";

// Approve/reject the same PlatPendingWrite proposals the assistant queues —
// just from a dedicated inbox instead of inline in the chat. Revalidate the
// dashboard too so its count/attention banner update immediately.
async function revalidate(slug: string) {
  revalidatePath(orgPath(slug, "/approvals"));
  revalidatePath(orgPath(slug, ""));
}

export async function approveProposalAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const proposalId = recordIdParam(formData.get("proposalId"));
  if (proposalId) {
    try {
      await executeProposal(ctx, proposalId, user.name);
    } catch {
      /* recorded as failed/expired on the pending row */
    }
  }
  await revalidate(ctx.orgSlug);
}

export async function rejectProposalAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const proposalId = recordIdParam(formData.get("proposalId"));
  if (proposalId) {
    try {
      await rejectProposal(ctx, proposalId, user.name);
    } catch {
      /* already resolved */
    }
  }
  await revalidate(ctx.orgSlug);
}
