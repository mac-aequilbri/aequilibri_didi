"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { inviteMember, setMemberActive, setMemberRole } from "@/lib/platform/provisioning";

// Team management actions (owner-gated). Errors with a user-facing message
// (last-owner guard, unknown email) surface via the status banner rather than
// the error boundary.

function back(orgSlug: string, qs: string): never {
  redirect(orgPath(orgSlug, `/team?${qs}`));
}

async function guarded(org: string) {
  const ctx = await requireOrgCtx(org);
  await requireAdmin(ctx);
  return ctx;
}

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const ctx = await guarded(String(formData.get("org") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    back(ctx.orgSlug, "status=invalid");
  }
  const status = await inviteMember(ctx, { name, email, role });
  revalidatePath(orgPath(ctx.orgSlug, "/team"));
  back(ctx.orgSlug, `status=${status}&who=${encodeURIComponent(email)}`);
}

export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const ctx = await guarded(String(formData.get("org") ?? ""));
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  try {
    await setMemberRole(ctx, email, role);
  } catch (err) {
    back(ctx.orgSlug, `status=error&msg=${encodeURIComponent(err instanceof Error ? err.message : "Update failed.")}`);
  }
  revalidatePath(orgPath(ctx.orgSlug, "/team"));
  back(ctx.orgSlug, `status=role_updated&who=${encodeURIComponent(email)}`);
}

export async function setMemberActiveAction(formData: FormData): Promise<void> {
  const ctx = await guarded(String(formData.get("org") ?? ""));
  const email = String(formData.get("email") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "1";
  try {
    await setMemberActive(ctx, email, active);
  } catch (err) {
    back(ctx.orgSlug, `status=error&msg=${encodeURIComponent(err instanceof Error ? err.message : "Update failed.")}`);
  }
  revalidatePath(orgPath(ctx.orgSlug, "/team"));
  back(ctx.orgSlug, `status=${active ? "reactivated_member" : "deactivated"}&who=${encodeURIComponent(email)}`);
}
