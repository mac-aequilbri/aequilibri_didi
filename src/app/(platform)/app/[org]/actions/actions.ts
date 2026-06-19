"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

// App status -> Airtable ACTION_HUB single-select value.
const ACTION_STATUS_TO_AIRTABLE: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Complete",
  deferred: "Deferred",
};

// App priority (P1/P2/P3) -> Airtable ACTION_HUB Priority (Low/Medium/High).
const ACTION_PRIORITY_TO_AIRTABLE: Record<string, string> = {
  P1: "High",
  P2: "Medium",
  P3: "Low",
};

export async function createActionItem(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const data = formToObject(formData);

  if (airtableEnabled()) {
    const fields: Record<string, unknown> = {
      Action_Name: String(data.title ?? "").slice(0, 200) || "Untitled action",
      Description: String(data.detail ?? ""),
      Status: ACTION_STATUS_TO_AIRTABLE[String(data.status ?? "open")] ?? "Open",
      Priority: ACTION_PRIORITY_TO_AIRTABLE[String(data.priority ?? "P2")] ?? "Medium",
    };
    if (data.dueDate) fields["Due_Date"] = String(data.dueDate);
    if (data.owner) fields["Notes"] = `Owner: ${String(data.owner)}`; // Assigned_To is a TEAM link
    await core.create(ctx.orgSlug, "ACTION_HUB", fields);
    revalidatePath(orgPath(ctx.orgSlug, "/actions"));
    redirect(orgPath(ctx.orgSlug, "/actions"));
  }

  await writeRecord(ctx, {
    table: "action",
    op: "create",
    data,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
  redirect(orgPath(ctx.orgSlug, "/actions"));
}

export async function updateActionStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordIdRaw || !status) return;

  // Airtable mode: record IDs are strings (rec…) and the write goes to the
  // canonical ACTION_HUB table, bypassing the Prisma-shaped writeRecord.
  if (airtableEnabled()) {
    const airStatus = ACTION_STATUS_TO_AIRTABLE[status];
    if (airStatus && recordIdRaw.startsWith("rec")) {
      await core.update(ctx.orgSlug, "ACTION_HUB", recordIdRaw, { Status: airStatus });
    }
    revalidatePath(orgPath(ctx.orgSlug, "/actions"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "action",
    op: "update",
    recordId,
    data: { status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
}
