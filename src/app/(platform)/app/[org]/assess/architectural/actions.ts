"use server";

import { redirect } from "next/navigation";
import { requireOrgCtx, getCurrentUser } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam } from "@/lib/platform/recordWriter";
import { runModule3Capability } from "@/services/platform/module3/engine";
import { parseDelimitedIds } from "@/services/platform/module3/shared";

export async function runArchitecturalScopeAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = recordIdParam(formData.get("jobId"));
  if (jobId == null) return;

  const ids = parseDelimitedIds(String(formData.get("documentIds") ?? ""));
  if (ids.length === 0) return;
  const zone = String(formData.get("zone") ?? "").trim() || undefined;
  const title = String(formData.get("title") ?? "").trim() || undefined;

  const { resultId } = await runModule3Capability(ctx, user.name, {
    capability: "architectural_scope_assessment",
    input: { jobId, documentIds: ids, zone, title },
  });
  redirect(orgPath(ctx.orgSlug, `/assess/architectural?run=${resultId}`));
}
