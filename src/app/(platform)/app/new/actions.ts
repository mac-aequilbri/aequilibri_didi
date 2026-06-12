"use server";

import { redirect } from "next/navigation";
import { clerkEnabled } from "@/lib/platform/authConfig";
import { AiAuthority, DEFAULT_FEATURES, EngagementType } from "@/lib/platform/types";
import { provisionOrganisation } from "@/services/platform/onboarding";

const ENGAGEMENT_TYPES: EngagementType[] = ["short_job", "long_project", "ongoing", "seasonal"];
const AUTHORITIES: AiAuthority[] = ["propose_only", "approve_required", "auto_low_risk"];

export async function provisionOrgAction(formData: FormData): Promise<void> {
  const { isPlatformAdmin } = await import("@/lib/platform/org-context");
  if (!(await isPlatformAdmin())) redirect("/app?denied=admin");

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

  // With Clerk active, default the first admin to the signing-in user so the
  // creator is a member of (and can access) the org they just provisioned.
  let adminName = String(formData.get("adminName") ?? "");
  let adminEmail = String(formData.get("adminEmail") ?? "");
  if (clerkEnabled() && !adminEmail.trim()) {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    adminEmail = user?.primaryEmailAddress?.emailAddress ?? "";
    adminName = adminName.trim() || user?.fullName || adminEmail.split("@")[0] || "Admin";
  }

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
    adminName,
    adminEmail,
    budgetCategories: lines("budgetCategories"),
    initialRules: lines("initialRules"),
  });

  if (!result.ok) {
    redirect(`/app/new?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/app/${result.slug}`);
}
