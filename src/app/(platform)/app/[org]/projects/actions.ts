"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeBimxEmbedUrl } from "@/lib/platform/bimx";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { recordIdParam, writeRecord } from "@/lib/platform/recordWriter";

export async function createJob(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const result = await writeRecord(ctx, {
    table: "job",
    op: "create",
    data: formToObject(formData),
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/projects"));
  redirect(orgPath(ctx.orgSlug, `/projects/${result.recordId}`));
}

export async function updateJob(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = recordIdParam(formData.get("recordId"));
  if (recordId == null) return;
  const data = formToObject(formData);
  delete data.recordId;
  await writeRecord(ctx, {
    table: "job",
    op: "update",
    recordId,
    data,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, `/projects/${recordId}`));
  redirect(orgPath(ctx.orgSlug, `/projects/${recordId}`));
}

// ── BIM models (BIMx embed viewer) ──────────────────────────────────
// Pasted embed URLs are validated against the graphisoft.com allowlist
// before storage; see src/lib/platform/bimx.ts for the security rationale.

export async function addBimModel(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const jobId = recordIdParam(formData.get("jobId"));
  const name = String(formData.get("name") ?? "").trim();
  const base = orgPath(ctx.orgSlug, `/projects/${jobId}/models`);
  if (jobId == null) redirect(orgPath(ctx.orgSlug, "/projects"));
  if (!name) redirect(`${base}/new?error=name_required`);

  const embedUrl = normalizeBimxEmbedUrl(String(formData.get("embedUrl") ?? ""));
  if (!embedUrl) redirect(`${base}/new?error=invalid_url`);

  await writeRecord(ctx, {
    table: "bim_model",
    op: "create",
    data: {
      jobId,
      name,
      embedUrl,
      clientVisible: formData.get("clientVisible") === "on",
      addedBy: user.name,
      notes: String(formData.get("notes") ?? ""),
    },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(base);
  redirect(base);
}

export async function setBimModelVisibility(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = recordIdParam(formData.get("recordId"));
  const jobId = recordIdParam(formData.get("jobId"));
  if (recordId == null) return;
  await writeRecord(ctx, {
    table: "bim_model",
    op: "update",
    recordId,
    data: { clientVisible: formData.get("clientVisible") === "true" },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, jobId == null ? "/projects" : `/projects/${jobId}/models`));
}

export async function deleteBimModel(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx);
  const recordId = recordIdParam(formData.get("recordId"));
  const jobId = recordIdParam(formData.get("jobId"));
  if (recordId == null) return;
  await writeRecord(ctx, {
    table: "bim_model",
    op: "delete",
    recordId,
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, jobId == null ? "/projects" : `/projects/${jobId}/models`));
}
