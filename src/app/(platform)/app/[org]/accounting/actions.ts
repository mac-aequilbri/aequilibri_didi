"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import {
  connectAccounting,
  disconnectAccounting,
  syncAccounting,
} from "@/services/platform/accounting";

function back(slug: string, error: string | null): never {
  redirect(orgPath(slug, error ? `/accounting?error=${encodeURIComponent(error)}` : "/accounting"));
}

export async function connectAccountingAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  if (!ctx.config.features.accounting) back(ctx.orgSlug, "Accounting integration is disabled.");
  const user = await getCurrentUser(ctx);
  const error = await connectAccounting(ctx, user.name);
  revalidatePath(orgPath(ctx.orgSlug, "/accounting"));
  back(ctx.orgSlug, error);
}

export async function syncAccountingAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  if (!ctx.config.features.accounting) back(ctx.orgSlug, "Accounting integration is disabled.");
  const user = await getCurrentUser(ctx);
  const error = await syncAccounting(ctx, user.name);
  revalidatePath(orgPath(ctx.orgSlug, "/accounting"));
  back(ctx.orgSlug, error);
}

export async function disconnectAccountingAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  if (!ctx.config.features.accounting) back(ctx.orgSlug, "Accounting integration is disabled.");
  const user = await getCurrentUser(ctx);
  await disconnectAccounting(ctx, user.name);
  revalidatePath(orgPath(ctx.orgSlug, "/accounting"));
  back(ctx.orgSlug, null);
}
