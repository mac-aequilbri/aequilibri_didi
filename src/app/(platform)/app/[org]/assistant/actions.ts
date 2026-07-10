"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { emitCorrection } from "@/lib/platform/corrections";
import { orgPath } from "@/lib/platform/paths";
import { executeProposal, recordIdParam, rejectProposal } from "@/lib/platform/recordWriter";
import { captureConversationNote } from "@/services/platform/documents";
import { endSession, sendChatMessage } from "@/services/platform/assistant/chat";
import { runHypothesisEngine } from "@/services/platform/learning";

export interface SendMessageState {
  ok: boolean;
  error?: string;
}

export async function sendMessageAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const text = String(formData.get("message") ?? "").trim();
  if (!text) return;
  const user = await getCurrentViewer(ctx);
  const sessionId = recordIdParam(formData.get("sessionId")) ?? undefined;
  await sendChatMessage(ctx, user.name, text, { sessionId, userRole: user.role });
  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
}

export async function resetSessionAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const sessionId = recordIdParam(formData.get("sessionId"));
  if (sessionId) await endSession(ctx, sessionId);
  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
}

export async function closeSessionReviewAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const sessionId = recordIdParam(formData.get("sessionId"));
  const jobId = recordIdParam(formData.get("jobId"));
  const reviewSummary = String(formData.get("reviewSummary") ?? "").trim();
  const correctionStatus = String(formData.get("correctionStatus") ?? "none");
  const aiOutput = String(formData.get("aiOutput") ?? "").trim();
  const humanCorrection = String(formData.get("humanCorrection") ?? "").trim();
  const rootCause = String(formData.get("rootCause") ?? "").trim();
  const dimension = String(formData.get("dimension") ?? "").trim() || "assistant.session";

  if (reviewSummary) {
    await captureConversationNote(ctx, user.name, {
      title: "Assistant session closeout",
      note: reviewSummary,
      sessionId: sessionId ?? undefined,
      jobId: jobId ?? undefined,
    });
  }

  let emittedCorrection = false;
  if (correctionStatus === "captured" && rootCause && (aiOutput || humanCorrection)) {
    await emitCorrection(ctx, { type: "human", name: user.name }, {
      jobId: typeof jobId === "number" ? jobId : undefined,
      entityType: "assistant_chat",
      entityId: typeof sessionId === "number" ? sessionId : undefined,
      dimension,
      aiValueText: aiOutput,
      humanValueText: humanCorrection,
      rootCause,
      context: {
        phase: "session_close",
        sessionId: sessionId == null ? "" : String(sessionId),
      },
    });
    emittedCorrection = true;
  }

  if (emittedCorrection) {
    await runHypothesisEngine(ctx);
  }
  if (sessionId) await endSession(ctx, sessionId);

  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
  revalidatePath(orgPath(ctx.orgSlug, "/learning-rules"));
  revalidatePath(orgPath(ctx.orgSlug, "/documents"));
}

/** Result of an approve/reject click, surfaced back to the chat panel via
 *  useActionState so a failed write is visible instead of silently vanishing. */
export interface ProposalActionResult {
  ok: boolean;
  error?: string;
}

export async function approveFromChatAction(
  _prev: ProposalActionResult | null,
  formData: FormData,
): Promise<ProposalActionResult> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const proposalId = recordIdParam(formData.get("proposalId"));
  if (!proposalId) return { ok: false, error: "Missing proposal reference." };
  try {
    await executeProposal(ctx, proposalId, user.name);
  } catch (err) {
    // Leave the row in place (no revalidate) so the inline error stays visible —
    // otherwise a silently-failed write looks identical to a successful one.
    return { ok: false, error: err instanceof Error ? err.message : "The change could not be applied." };
  }
  // Refresh the whole org subtree, not just /assistant: an approved write lands
  // in a domain table (actions register, dashboard, detail pages), so those are
  // the views where the user actually looks to confirm the change took effect.
  revalidatePath(orgPath(ctx.orgSlug), "layout");
  return { ok: true };
}

export async function rejectFromChatAction(
  _prev: ProposalActionResult | null,
  formData: FormData,
): Promise<ProposalActionResult> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const proposalId = recordIdParam(formData.get("proposalId"));
  if (!proposalId) return { ok: false, error: "Missing proposal reference." };
  try {
    await rejectProposal(ctx, proposalId, user.name);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The change could not be rejected." };
  }
  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
  return { ok: true };
}

// (rejection changes nothing in a domain table, so /assistant is enough.)

export async function saveConversationNoteFromChatAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;
  await captureConversationNote(ctx, user.name, {
    title: String(formData.get("title") ?? "").trim() || undefined,
    note,
    sessionId: recordIdParam(formData.get("sessionId")) ?? undefined,
    jobId: recordIdParam(formData.get("jobId")) ?? undefined,
  });
  revalidatePath(orgPath(ctx.orgSlug, "/assistant"));
  revalidatePath(orgPath(ctx.orgSlug, "/documents"));
}
