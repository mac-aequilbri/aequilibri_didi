"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import {
  analyzeDocument,
  ingestDocumentFile,
  ingestDocumentLink,
} from "@/services/platform/documents";
import { prisma } from "@/lib/db";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function uploadDocument(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = Number(formData.get("jobId")) || undefined;
  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");
  const url = String(formData.get("url") ?? "").trim();

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      redirect(orgPath(ctx.orgSlug, "/documents/new?error=too_large"));
    }
    const jobCode = jobId
      ? (await prisma.platJob.findFirst({ where: { id: jobId, orgId: ctx.orgId }, select: { code: true } }))?.code
      : undefined;
    await ingestDocumentFile(ctx, user.name, {
      jobId,
      jobCode,
      title: title || file.name,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      buf: Buffer.from(await file.arrayBuffer()),
    });
  } else if (url) {
    await ingestDocumentLink(ctx, user.name, {
      jobId,
      title: title || url,
      url,
      docType: String(formData.get("docType") ?? ""),
    });
  } else {
    redirect(orgPath(ctx.orgSlug, "/documents/new?error=nothing_to_save"));
  }

  revalidatePath(orgPath(ctx.orgSlug, "/documents"));
  redirect(orgPath(ctx.orgSlug, "/documents"));
}

export async function analyzeDocumentAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const id = Number(formData.get("recordId"));
  if (!id) return;
  await analyzeDocument(ctx, user.name, id);
  revalidatePath(orgPath(ctx.orgSlug, `/documents/${id}`));
  revalidatePath(orgPath(ctx.orgSlug, "/documents"));
}
