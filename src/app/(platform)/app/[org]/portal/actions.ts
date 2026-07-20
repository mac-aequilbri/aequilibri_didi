"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

export async function generatePortalToken(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = Number(formData.get("jobId"));
  if (!jobId) return;
  const expiresAt = String(formData.get("expiresAt") ?? "");
  const token = randomBytes(32).toString("hex");
  await writeRecord(ctx, {
    table: "portal_token",
    op: "create",
    data: {
      jobId,
      token,
      label: String(formData.get("label") ?? ""),
      expiresAt: expiresAt || undefined,
    },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/portal"));
  // Highlight the fresh row so the issuer can grab the link immediately. A
  // token prefix (not the full secret) is enough to identify the row.
  redirect(orgPath(ctx.orgSlug, `/portal?issued=${token.slice(0, 12)}`));
}

export async function deactivatePortalToken(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = Number(formData.get("recordId"));
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "portal_token",
    op: "update",
    recordId,
    data: { isActive: false },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/portal"));
}
