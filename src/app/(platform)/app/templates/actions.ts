"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createTemplateRegistry,
  deleteTemplateRegistry,
  updateTemplateRegistry,
} from "@/lib/airtable/control";
import { isPlatformAdmin } from "@/lib/platform/org-context";

async function gate(): Promise<void> {
  if (!(await isPlatformAdmin())) redirect("/app?denied=admin");
}

const S = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createTemplateMapping(formData: FormData): Promise<void> {
  await gate();
  const industry = S(formData, "industry");
  const templateBaseId = S(formData, "templateBaseId");
  if (!industry || !templateBaseId) {
    redirect(`/app/templates/new?error=${encodeURIComponent("Industry and Template base id are required.")}`);
  }
  if (!/^app[A-Za-z0-9]{14,}$/.test(templateBaseId)) {
    redirect(`/app/templates/new?error=${encodeURIComponent(`"${templateBaseId}" is not a valid Airtable base id.`)}`);
  }
  await createTemplateRegistry({
    industry,
    subIndustry: S(formData, "subIndustry"),
    verticalKey: S(formData, "verticalKey") || industry.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    templateBaseId,
    sortOrder: Number(formData.get("sortOrder")) || 0,
    notes: S(formData, "notes"),
  });
  revalidatePath("/app/templates");
  redirect("/app/templates");
}

export async function toggleTemplateMapping(formData: FormData): Promise<void> {
  await gate();
  const recordId = S(formData, "recordId");
  const isActive = S(formData, "isActive") === "true"; // current state → flip
  if (recordId) await updateTemplateRegistry(recordId, { isActive: !isActive });
  revalidatePath("/app/templates");
}

export async function deleteTemplateMapping(formData: FormData): Promise<void> {
  await gate();
  const recordId = S(formData, "recordId");
  if (recordId) await deleteTemplateRegistry(recordId);
  revalidatePath("/app/templates");
}
