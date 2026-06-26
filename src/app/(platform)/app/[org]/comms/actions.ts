"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

const COMM_STATUSES = ["pending", "sent", "acknowledged", "overdue"];

export async function createComm(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate

  await writeRecord(ctx, {
    table: "comms",
    op: "create",
    data: formToObject(formData),
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/comms"));
  redirect(orgPath(ctx.orgSlug, "/comms"));
}

export async function setCommStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordId || !COMM_STATUSES.includes(status)) return;

  // recordWriter routes to Airtable by the rec-id shape. Stamp Sent_By when the
  // communication is marked sent, so the coordination log shows who actioned it.
  await writeRecord(ctx, {
    table: "comms",
    op: "update",
    recordId,
    data: { status, ...(status === "sent" ? { sentBy: user.name } : {}) },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/comms"));
}
