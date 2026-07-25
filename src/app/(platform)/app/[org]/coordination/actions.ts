"use server";

import { revalidatePath } from "next/cache";
import { dismissCascadeAdvisory } from "@/lib/platform/cascade";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";

/** Inline quick-actions (Spec 12 M8 lock decision D-10: ISSUES status and
 *  COMMS status only, as plain role-gated server actions — human-direct
 *  writes, so no proposal queue; recordWriter enforces canWrite + RLS). */
export async function quickResolveAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const kind = String(formData.get("kind") ?? "");
  const recordId = String(formData.get("recordId") ?? "");
  if (!recordId) return;

  const { writeRecord } = await import("@/lib/platform/recordWriter");
  if (kind === "action") {
    await writeRecord(ctx, {
      table: "action",
      op: "update",
      recordId,
      data: { status: "done" },
      actor: { type: "human", name: user.name },
    });
  } else if (kind === "comms") {
    await writeRecord(ctx, {
      table: "comms",
      op: "update",
      recordId,
      data: { status: "sent", sentBy: user.name },
      actor: { type: "human", name: user.name },
    });
  } else {
    return;
  }
  revalidatePath(orgPath(ctx.orgSlug, "/coordination"));
  revalidatePath(orgPath(ctx.orgSlug, ""));
}

/** Dismiss a cascade advisory (Spec 12 Module 5 rules A/B/C/E). mode
 *  "override" = "not relevant": the rule's confidence decays (governance
 *  ladder included) and a Module 5 CORRECTIONS record is captured. */
export async function dismissAdvisoryAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // write gate
  const advisoryId = String(formData.get("advisoryId") ?? "");
  const mode = String(formData.get("mode") ?? "done");
  if (!advisoryId.startsWith("rec")) return;

  await dismissCascadeAdvisory(
    ctx,
    advisoryId,
    { type: "human", name: user.name },
    mode === "override",
  );
  revalidatePath(orgPath(ctx.orgSlug, "/coordination"));
  revalidatePath(orgPath(ctx.orgSlug, ""));
}
