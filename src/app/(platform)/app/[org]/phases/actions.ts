"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";
import {
  addPhaseEvidence,
  applyEvidenceSuggestion,
  assessPhaseEvidence,
  dismissEvidenceSuggestion,
} from "@/services/platform/construction/phaseEvidence";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // matches documents/actions.ts

export async function approvePhase(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordIdRaw = String(formData.get("recordId") ?? "");
  if (!recordIdRaw) return;

  if (airtableEnabled()) {
    if (recordIdRaw.startsWith("rec")) {
      await core.update(ctx.orgSlug, "PHASES", recordIdRaw, {
        Is_AI_Draft: false,
        Approved_By: user.name,
      });
    }
    revalidatePath(orgPath(ctx.orgSlug, "/phases"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "phase",
    op: "update",
    recordId,
    data: { isAiDraft: false, approvedBy: user.name },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}

export async function rejectPhase(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordIdRaw = String(formData.get("recordId") ?? "");
  if (!recordIdRaw) return;

  if (airtableEnabled()) {
    if (recordIdRaw.startsWith("rec")) {
      await core.remove(ctx.orgSlug, "PHASES", [recordIdRaw]);
    }
    revalidatePath(orgPath(ctx.orgSlug, "/phases"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "phase",
    op: "delete",
    recordId,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}

export async function uploadPhaseEvidenceAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const phaseId = Number(formData.get("phaseId"));
  const file = formData.get("file");
  if (!phaseId || !(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(orgPath(ctx.orgSlug, "/phases?err=File too large (max 5 MB)"));
  }
  const res = await addPhaseEvidence(ctx, user.name, {
    phaseId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    buf: Buffer.from(await file.arrayBuffer()),
  });
  if (!res.ok) redirect(orgPath(ctx.orgSlug, `/phases?err=${encodeURIComponent(res.error ?? "Upload failed")}`));
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}

export async function assessPhaseEvidenceAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const phaseId = Number(formData.get("phaseId"));
  if (!phaseId) return;
  const res = await assessPhaseEvidence(ctx, user.name, phaseId);
  if (!res.ok) redirect(orgPath(ctx.orgSlug, `/phases?err=${encodeURIComponent(res.error ?? "Review failed")}`));
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}

export async function applyEvidenceSuggestionAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const phaseId = Number(formData.get("phaseId"));
  const finalPct = Number(formData.get("finalPct"));
  if (!phaseId || !Number.isFinite(finalPct)) return;
  const res = await applyEvidenceSuggestion(ctx, user.name, phaseId, finalPct);
  if (!res.ok) redirect(orgPath(ctx.orgSlug, `/phases?err=${encodeURIComponent(res.error ?? "Apply failed")}`));
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}

export async function dismissEvidenceSuggestionAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const phaseId = Number(formData.get("phaseId"));
  if (!phaseId) return;
  const res = await dismissEvidenceSuggestion(ctx, user.name, phaseId);
  if (!res.ok) redirect(orgPath(ctx.orgSlug, `/phases?err=${encodeURIComponent(res.error ?? "Dismiss failed")}`));
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}

export async function setPhaseProgress(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const completionPct = Number(formData.get("completionPct"));
  if (!recordIdRaw || !Number.isFinite(completionPct)) return;
  const pct = Math.max(0, Math.min(100, completionPct));
  const status = pct >= 100 ? "complete" : pct > 0 ? "in_progress" : "pending";

  if (airtableEnabled()) {
    if (recordIdRaw.startsWith("rec")) {
      // typecast creates the "in_progress" option if absent.
      await core.update(ctx.orgSlug, "PHASES", recordIdRaw, {
        Completion_Pct: pct,
        Status: status,
      });
    }
    revalidatePath(orgPath(ctx.orgSlug, "/phases"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "phase",
    op: "update",
    recordId,
    data: { completionPct: pct, status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/phases"));
}
