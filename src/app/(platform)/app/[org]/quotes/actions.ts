"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam } from "@/lib/platform/recordWriter";
import {
  acceptProposal,
  addQuoteLine,
  createQuote,
  generateQuoteFromBudget,
  removeQuoteLine,
  setQuoteStatus,
  updateQuoteLine,
  updateQuoteMeta,
  type QuoteStatus,
} from "@/services/platform/construction/quotes";

export async function createQuoteAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = recordIdParam(formData.get("jobId"));
  const title = String(formData.get("title") ?? "").trim();
  if (jobId == null || !title) return;
  const fromBudget = formData.get("fromBudget") === "on";
  const quoteId = fromBudget
    ? await generateQuoteFromBudget(ctx, user.name, jobId)
    : await createQuote(ctx, user.name, {
        jobId,
        title,
        clientName: String(formData.get("clientName") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        validUntil: String(formData.get("validUntil") ?? "").trim(),
      });
  redirect(orgPath(ctx.orgSlug, `/quotes/${quoteId}`));
}

export async function generateFromBudgetAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = recordIdParam(formData.get("jobId"));
  if (jobId == null) return;
  const quoteId = await generateQuoteFromBudget(ctx, user.name, jobId);
  redirect(orgPath(ctx.orgSlug, `/quotes/${quoteId}`));
}

export async function addLineAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const quoteId = recordIdParam(formData.get("quoteId"));
  const description = String(formData.get("description") ?? "").trim();
  if (quoteId == null || !description) return;
  await addQuoteLine(ctx, user.name, quoteId, {
    description,
    category: String(formData.get("category") ?? "").trim(),
    qty: Number(formData.get("qty")) || 1,
    unit: String(formData.get("unit") ?? "item").trim() || "item",
    unitPrice: Number(formData.get("unitPrice")) || 0,
  });
  revalidatePath(orgPath(ctx.orgSlug, `/quotes/${quoteId}`));
}

export async function updateLineAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const quoteId = recordIdParam(formData.get("quoteId"));
  const lineId = recordIdParam(formData.get("lineId"));
  const description = String(formData.get("description") ?? "").trim();
  if (quoteId == null || lineId == null || !description) return;
  await updateQuoteLine(ctx, user.name, quoteId, lineId, {
    description,
    category: String(formData.get("category") ?? "").trim(),
    qty: Number(formData.get("qty")) || 1,
    unit: String(formData.get("unit") ?? "item").trim() || "item",
    unitPrice: Number(formData.get("unitPrice")) || 0,
  });
  revalidatePath(orgPath(ctx.orgSlug, `/quotes/${quoteId}`));
}

export async function removeLineAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const quoteId = recordIdParam(formData.get("quoteId"));
  const lineId = recordIdParam(formData.get("lineId"));
  if (quoteId == null || lineId == null) return;
  await removeQuoteLine(ctx, user.name, quoteId, lineId);
  revalidatePath(orgPath(ctx.orgSlug, `/quotes/${quoteId}`));
}

/** Accept the proposal on the client's behalf. For an assessment-sourced
 *  proposal this materializes the managed project and redirects to it; for an
 *  in-project quote it just records acceptance and stays on the quote. */
export async function acceptProposalAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const quoteId = recordIdParam(formData.get("quoteId"));
  if (quoteId == null) return;
  const jobId = await acceptProposal(ctx, user.name, quoteId);
  if (jobId != null) {
    redirect(orgPath(ctx.orgSlug, `/projects/${jobId}`));
  }
  revalidatePath(orgPath(ctx.orgSlug, `/quotes/${quoteId}`));
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const quoteId = recordIdParam(formData.get("quoteId"));
  const status = String(formData.get("status") ?? "") as QuoteStatus;
  if (quoteId == null || !status) return;
  await setQuoteStatus(ctx, user.name, quoteId, status);
  revalidatePath(orgPath(ctx.orgSlug, `/quotes/${quoteId}`));
}

export async function updateMetaAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const quoteId = recordIdParam(formData.get("quoteId"));
  if (quoteId == null) return;
  await updateQuoteMeta(ctx, user.name, quoteId, {
    title: String(formData.get("title") ?? "").trim(),
    clientName: String(formData.get("clientName") ?? "").trim(),
    notes: String(formData.get("notes") ?? ""),
    validUntil: String(formData.get("validUntil") ?? "").trim(),
    gstRate: Number(formData.get("gstRate")) || 0,
  });
  revalidatePath(orgPath(ctx.orgSlug, `/quotes/${quoteId}`));
}
