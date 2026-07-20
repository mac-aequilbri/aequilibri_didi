"use server";

import { redirect } from "next/navigation";
import { requireOrgCtx, requireFinancialAccess } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam } from "@/lib/platform/recordWriter";
import { runModule3Capability } from "@/services/platform/module3/engine";
import { parseDelimitedIds } from "@/services/platform/module3/shared";

export async function runTenderComparisonAction(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await requireFinancialAccess(ctx);
  const jobId = recordIdParam(formData.get("jobId"));
  if (jobId == null) return;

  // Document selection comes from the checkbox column on the documents table.
  const ids = parseDelimitedIds(
    formData
      .getAll("docIds")
      .filter((v): v is string => typeof v === "string")
      .join("\n"),
  );
  if (ids.length === 0) redirect(orgPath(ctx.orgSlug, "/assess/tender?error=no_docs"));

  const title = String(formData.get("title") ?? "").trim();
  const { resultId } = await runModule3Capability(ctx, user.name, {
    capability: "builder_tender_comparison",
    input: { jobId, documentIds: ids, title: title || undefined },
  });
  redirect(orgPath(ctx.orgSlug, `/assess/tender?run=${resultId}`));
}
