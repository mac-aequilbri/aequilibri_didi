"use server";

import { revalidatePath } from "next/cache";
import {
  CORRECTION_ROOT_CAUSES,
  emitCorrection,
  type CorrectionRootCause,
} from "@/lib/platform/corrections";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { executeProposal, recordIdParam, rejectProposal } from "@/lib/platform/recordWriter";

// Approve/reject the same PlatPendingWrite proposals the assistant queues —
// just from a dedicated inbox instead of inline in the chat. Revalidate the
// dashboard too so its count/attention banner update immediately.
async function revalidate(slug: string) {
  revalidatePath(orgPath(slug, "/approvals"));
  revalidatePath(orgPath(slug, ""));
}

/** Spec 12 Module 2 correction capture: the reviewer can correct individual
 *  field values before approving (inputs named "field:<key>"). Wherever the
 *  confirmed value differs from the AI's proposal, a CORRECTIONS record is
 *  emitted automatically — the primary Learning Loop feed from Module 2. */
export async function approveProposalAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const proposalId = recordIdParam(formData.get("proposalId"));
  if (proposalId == null) return;

  const pending = (await loadPendingWrites(ctx)).find((p) => String(p.id) === String(proposalId));
  let original: Record<string, unknown> = {};
  try {
    original = JSON.parse(pending?.payload ?? "{}") as Record<string, unknown>;
  } catch {
    /* legacy/opaque payload — approve verbatim below */
  }

  // Collect reviewer edits: only fields whose submitted text differs from the
  // proposed value. Values stay strings; the write path's typecast/validation
  // layer coerces them per field schema.
  const edits: Record<string, unknown> = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("field:") || typeof value !== "string") continue;
    const key = name.slice("field:".length);
    const proposed = original[key];
    const proposedStr = proposed == null ? "" : String(proposed);
    if (value !== proposedStr) edits[key] = value;
  }

  const rawCategory = String(formData.get("rootCauseCategory") ?? "");
  const rootCauseCategory: CorrectionRootCause = (
    CORRECTION_ROOT_CAUSES as readonly string[]
  ).includes(rawCategory)
    ? (rawCategory as CorrectionRootCause)
    : "Estimation Error";
  const rootCauseNote =
    String(formData.get("rootCauseNote") ?? "").trim() ||
    "Reviewer corrected the proposed value during approval";

  try {
    await executeProposal(ctx, proposalId, user.name, Object.keys(edits).length ? edits : undefined);
  } catch {
    /* recorded as failed/expired on the pending row */
    await revalidate(ctx.orgSlug);
    return;
  }

  // Correction capture is best-effort — a logging failure must not undo an
  // approved write. One CORRECTIONS record per corrected field.
  const jobId = typeof original.jobId === "number" ? original.jobId : undefined;
  for (const [key, humanValue] of Object.entries(edits)) {
    const ai = original[key];
    const aiNum = typeof ai === "number" ? ai : Number(ai);
    const humanNum = Number(humanValue);
    const numeric =
      Number.isFinite(aiNum) && Number.isFinite(humanNum) && String(ai ?? "").trim() !== "";
    await emitCorrection(ctx, { type: "human", name: user.name }, {
      jobId,
      entityType: pending?.tableKey ?? "pending_write",
      dimension: `${pending?.tableKey ?? "record"}.${key}`,
      ...(numeric
        ? { aiValue: aiNum, humanValue: humanNum }
        : { aiValueText: ai == null ? "" : String(ai), humanValueText: String(humanValue) }),
      sourceModule: "module2",
      rootCauseCategory,
      rootCause: rootCauseNote,
      context: {
        table: pending?.tableKey ?? "",
        op: pending?.op ?? "",
        // Spec 12: "the document is the source" — ingestion-routed proposals
        // carry their source document reference in the payload.
        ...(typeof original.sourceType === "string" ? { _sourceType: original.sourceType } : {}),
        ...(original.sourceId != null ? { _sourceId: String(original.sourceId) } : {}),
      },
    }).catch(() => {});
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
