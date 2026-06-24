"use server";

import { redirect } from "next/navigation";
import { requireOrgCtx, getCurrentUser } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam } from "@/lib/platform/recordWriter";
import { runModule3Capability } from "@/services/platform/module3/engine";
import { parseDelimitedIds } from "@/services/platform/module3/shared";

export async function runTenderComparisonAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = recordIdParam(formData.get("jobId"));
  if (jobId == null) return;

  const ids = parseDelimitedIds(String(formData.get("documentIds") ?? ""));
  if (ids.length === 0) return;

  const title = String(formData.get("title") ?? "").trim();
  const { resultId } = await runModule3Capability(ctx, user.name, {
    capability: "builder_tender_comparison",
    input: { jobId, documentIds: ids, title: title || undefined },
  });
  redirect(orgPath(ctx.orgSlug, `/assess/tender?run=${resultId}`));
}
