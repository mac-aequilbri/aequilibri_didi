"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

// App decision status -> Airtable DECISIONS single-select value.
const DECISION_STATUS_TO_AIRTABLE: Record<string, string> = {
  proposed: "Pending",
  confirmed: "Made",
  superseded: "Reversed",
};

export async function createDecision(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const data = formToObject(formData);
  data.madeBy = data.madeBy || user.name;

  if (airtableEnabled()) {
    const description = String(data.description ?? "").trim();
    await core.create(ctx.orgSlug, "DECISIONS", {
      Decision_Name: description.slice(0, 120) || "Untitled decision",
      Decision_Description: description,
      Rationale: String(data.rationale ?? ""),
      Status: DECISION_STATUS_TO_AIRTABLE[String(data.status ?? "proposed")] ?? "Pending",
    });
    revalidatePath(orgPath(ctx.orgSlug, "/decisions"));
    redirect(orgPath(ctx.orgSlug, "/decisions"));
  }

  await writeRecord(ctx, {
    table: "decision",
    op: "create",
    data,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/decisions"));
  redirect(orgPath(ctx.orgSlug, "/decisions"));
}

export async function setDecisionStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordIdRaw || !["proposed", "confirmed", "superseded"].includes(status)) return;

  if (airtableEnabled()) {
    const airStatus = DECISION_STATUS_TO_AIRTABLE[status];
    if (airStatus && recordIdRaw.startsWith("rec")) {
      await core.update(ctx.orgSlug, "DECISIONS", recordIdRaw, { Status: airStatus });
    }
    revalidatePath(orgPath(ctx.orgSlug, "/decisions"));
    return;
  }

  const recordId = Number(recordIdRaw);
  if (!recordId) return;
  await writeRecord(ctx, {
    table: "decision",
    op: "update",
    recordId,
    data: { status, ...(status === "confirmed" ? { decidedAt: new Date().toISOString() } : {}) },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/decisions"));
}
