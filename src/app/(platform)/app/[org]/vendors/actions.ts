"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";
import type { CreateFormState } from "@/components/form/CreateForm";

export async function createVendor(_prev: CreateFormState, formData: FormData): Promise<CreateFormState> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  try {
    await writeRecord(ctx, {
      table: "vendor",
      op: "create",
      data: formToObject(formData),
      actor: { type: "human", name: user.name },
    });
  } catch (e) {
    console.error("[createVendor] write rejected:", e);
    return { error: "Couldn't save the vendor — nothing was recorded. The org's base rejected the write; check the server log for details." };
  }
  revalidatePath(orgPath(ctx.orgSlug, "/vendors"));
  redirect(orgPath(ctx.orgSlug, "/vendors"));
}
