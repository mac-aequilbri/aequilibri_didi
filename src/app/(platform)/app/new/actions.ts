"use server";

import { redirect } from "next/navigation";
import { AiAuthority, DEFAULT_FEATURES, EngagementType } from "@/lib/platform/types";
import { provisionOrganisation } from "@/services/platform/onboarding";

const ENGAGEMENT_TYPES: EngagementType[] = ["short_job", "long_project", "ongoing", "seasonal"];
const AUTHORITIES: AiAuthority[] = ["propose_only", "approve_required", "auto_low_risk"];

export async function provisionOrgAction(formData: FormData): Promise<void> {
  const defaultEngagementType = String(formData.get("defaultEngagementType") ?? "long_project");
  const aiAuthority = String(formData.get("aiAuthority") ?? "approve_required");

  const allowedEngagementTypes = ENGAGEMENT_TYPES.filter(
    (t) => formData.get(`engagement_${t}`) === "on",
  );
  const features: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULT_FEATURES)) {
    features[key] = formData.get(`feature_${key}`) === "on";
  }
  const lines = (name: string) =>
    String(formData.get(name) ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

  const result = await provisionOrganisation({
    slug: String(formData.get("slug") ?? ""),
    name: String(formData.get("name") ?? ""),
    defaultEngagementType: (ENGAGEMENT_TYPES.includes(defaultEngagementType as EngagementType)
      ? defaultEngagementType
      : "long_project") as EngagementType,
    allowedEngagementTypes,
    aiAuthority: (AUTHORITIES.includes(aiAuthority as AiAuthority)
      ? aiAuthority
      : "approve_required") as AiAuthority,
    assistantName: String(formData.get("assistantName") ?? ""),
    assistantPersona: String(formData.get("assistantPersona") ?? ""),
    features,
    adminName: String(formData.get("adminName") ?? ""),
    adminEmail: String(formData.get("adminEmail") ?? ""),
    budgetCategories: lines("budgetCategories"),
    initialRules: lines("initialRules"),
  });

  if (!result.ok) {
    redirect(`/app/new?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/app/${result.slug}`);
}
