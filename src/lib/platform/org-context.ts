// Org resolution for the platform routes. Tenancy is carried in the URL
// (/app/[org]/...), so the context is derived from the slug — no cookie.
// Portal routes bypass this entirely and validate PlatConPortalToken instead.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  AiAuthority,
  DEFAULT_FEATURES,
  EngagementType,
  OrgConfig,
  OrgCtx,
} from "./types";

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseConfig(settingsRaw: string): OrgConfig {
  const settings = parseJson<Partial<OrgConfig>>(settingsRaw, {});
  return {
    assistant: {
      name: settings.assistant?.name ?? "Assistant",
      persona:
        settings.assistant?.persona ??
        "You are the AI project coordinator for this organisation. Be precise, data-driven, and flag risks proactively.",
    },
    features: { ...DEFAULT_FEATURES, ...(settings.features ?? {}) },
  };
}

export async function getOrgCtx(orgSlug: string): Promise<OrgCtx | null> {
  const org = await prisma.platOrganisation.findFirst({
    where: { slug: orgSlug, isActive: true },
  });
  if (!org) return null;
  return {
    orgId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    vertical: org.vertical,
    defaultEngagementType: org.defaultEngagementType as EngagementType,
    allowedEngagementTypes: parseJson<EngagementType[]>(org.allowedEngagementTypes, [
      org.defaultEngagementType as EngagementType,
    ]),
    aiAuthority: org.aiAuthority as AiAuthority,
    config: parseConfig(org.settings),
  };
}

/** Resolve the org or bounce to the org picker. First line of every platform page/action. */
export async function requireOrgCtx(orgSlug: string): Promise<OrgCtx> {
  const ctx = await getOrgCtx(orgSlug);
  if (!ctx) redirect("/app");
  return ctx;
}

/** Current user for actor stamping — demo auth (first active admin, else "Demo User").
 *  Swappable for Clerk later behind the same shape. */
export async function getCurrentUser(
  ctx: OrgCtx,
): Promise<{ name: string; role: string; email: string }> {
  const member = await prisma.platCfgTeamMember.findFirst({
    where: { orgId: ctx.orgId, isActive: true },
    orderBy: [{ role: "asc" }, { id: "asc" }], // "admin" sorts before "editor"/"readonly"
  });
  return member
    ? { name: member.name, role: member.role, email: member.email }
    : { name: "Demo User", role: "admin", email: "" };
}
