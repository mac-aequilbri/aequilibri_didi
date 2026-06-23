// Org resolution for the platform routes. Tenancy is carried in the URL
// (/app/[org]/...), so the context is derived from the slug — no cookie.
// Portal routes bypass this entirely and validate PlatConPortalToken instead.
//
// Authentication: when Clerk is configured (lib/platform/authConfig), the
// signed-in user's email must match an active PlatCfgTeamMember of the org —
// view access for any role, writes for editor/admin only. Without Clerk the
// platform runs in open demo mode (first admin acts as the current user).

import { redirect } from "next/navigation";
import {
  controlEnabled,
  getOrgRegistry,
  listControlTeam,
  type ControlTeamMember,
} from "@/lib/airtable/control";
import { prisma } from "@/lib/db";
import { clerkEnabled, platformAdminEmails } from "./authConfig";
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

/** Signed-in user's primary email via Clerk, or null in demo mode. */
export async function getAuthEmail(): Promise<string | null> {
  if (!clerkEnabled()) return null;
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
}

/** Find a team member by email in whichever store holds the registry. */
async function findMember(ctx: OrgCtx, email: string): Promise<ControlTeamMember | null> {
  if (controlEnabled()) {
    const members = await listControlTeam(ctx.orgSlug);
    return members.find((m) => m.email.toLowerCase() === email) ?? null;
  }
  const members = await prisma.platCfgTeamMember.findMany({
    where: { orgId: ctx.orgId, isActive: true },
  });
  const m = members.find((x) => x.email.toLowerCase() === email);
  return m ? { name: m.name, email: m.email, role: m.role, isActive: m.isActive } : null;
}

export async function getOrgCtx(orgSlug: string): Promise<OrgCtx | null> {
  if (controlEnabled()) {
    const e = await getOrgRegistry(orgSlug);
    if (!e || !e.isActive) return null;
    return {
      orgId: e.orgId,
      orgSlug: e.slug,
      orgName: e.name,
      vertical: e.vertical,
      defaultEngagementType: e.defaultEngagementType as EngagementType,
      allowedEngagementTypes: parseJson<EngagementType[]>(e.allowedEngagementTypes, [
        e.defaultEngagementType as EngagementType,
      ]),
      aiAuthority: e.aiAuthority as AiAuthority,
      config: parseConfig(e.settings),
    };
  }
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

/** Resolve the org or bounce to the org picker. First line of every platform
 *  page/action. With Clerk active, the user must also be an active member. */
export async function requireOrgCtx(orgSlug: string): Promise<OrgCtx> {
  const ctx = await getOrgCtx(orgSlug);
  if (!ctx) redirect("/app");

  const email = await getAuthEmail();
  if (email !== null) {
    const member = await findMember(ctx, email);
    if (!member) redirect("/app?denied=1");
  }
  return ctx;
}

export interface CurrentUser {
  name: string;
  role: string;
  email: string;
}

/** Current user for actor stamping. Called on every mutation path, so with
 *  Clerk active it doubles as the write gate: non-members are bounced and
 *  read-only members cannot mutate. Demo mode returns the first active admin. */
export async function getCurrentUser(ctx: OrgCtx): Promise<CurrentUser> {
  const email = await getAuthEmail();
  if (email !== null) {
    const member = await findMember(ctx, email);
    if (!member) redirect("/app?denied=1");
    if (member.role === "readonly") {
      throw new Error("Your role in this organisation is read-only — writes are not permitted.");
    }
    return { name: member.name, role: member.role, email: member.email };
  }

  // Demo mode: the first active admin (admins sort before editor/readonly).
  if (controlEnabled()) {
    const members = await listControlTeam(ctx.orgSlug);
    const member = [...members].sort((a, b) => a.role.localeCompare(b.role))[0];
    return member
      ? { name: member.name, role: member.role, email: member.email }
      : { name: "Demo User", role: "admin", email: "" };
  }
  const member = await prisma.platCfgTeamMember.findFirst({
    where: { orgId: ctx.orgId, isActive: true },
    orderBy: [{ role: "asc" }, { id: "asc" }], // "admin" sorts before "editor"/"readonly"
  });
  return member
    ? { name: member.name, role: member.role, email: member.email }
    : { name: "Demo User", role: "admin", email: "" };
}

/** Admin-only gate for destructive/config operations. */
export async function requireAdmin(ctx: OrgCtx): Promise<CurrentUser> {
  const user = await getCurrentUser(ctx);
  if (clerkEnabled() && user.role !== "admin") {
    throw new Error("This operation requires the admin role.");
  }
  return user;
}

/** Platform-operator gate: provisioning new customer organisations is an
 *  internal operation (doc module 1), not something any signed-in user may
 *  do. Demo mode is open by definition; with auth on, the user's email must
 *  be in PLATFORM_ADMIN_EMAILS. */
export async function isPlatformAdmin(): Promise<boolean> {
  if (!clerkEnabled()) return true; // demo mode (already gated fail-closed by the proxy)
  const email = await getAuthEmail();
  return !!email && platformAdminEmails().includes(email);
}
