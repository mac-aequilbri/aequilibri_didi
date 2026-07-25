// Navigation built from org configuration — the doc's "same architecture,
// different configuration". One nav tree; engagement type and feature flags
// decide which entries appear for a given organisation.

import type { NavSection } from "@/components/Sidebar";
import type { EngagementProfile } from "./engagementProfile";
import { orgPath } from "./paths";
import { ROUTE_LABELS } from "./routeLabels";
import { financeVisible } from "./roles";
import { OrgCtx } from "./types";

/** Live counts surfaced as nav pills. All optional; absent = no pill. */
export interface NavCounts {
  /** Pending approvals — shown as the prominent (terracotta) badge. */
  pending?: number;
  openActions?: number;
  openRisks?: number;
  openVariations?: number;
}

// Canonical labels come from the shared registry so the nav and the
// breadcrumbs always agree on what a window is called.
const L = (segment: string) => ROUTE_LABELS[segment];

export function buildNav(
  ctx: OrgCtx,
  jobCount: number,
  counts: NavCounts = {},
  /** Viewer's normalized team role. Financial entries render for owner only
   *  (Spec 12 Module 8) — the routes themselves are also server-gated. */
  role: string = "owner",
  /** Engagement profile (Spec 12 Module 5 §"Engagement type configuration") —
   *  calibrates construct depth: a Short Job org carries risk flags inline on
   *  ISSUES, so the full Risk Register entry is hidden. Absent = full depth. */
  profile?: Pick<EngagementProfile, "fullRiskRegister">,
): NavSection[] {
  const f = ctx.config.features;
  // CLS (governance §3): Owner, Finance Manager and Auditor sub-roles.
  const financial = financeVisible(role);
  const p = (path: string) => orgPath(ctx.orgSlug, path);
  // Single-engagement long_project orgs (e.g. Dulong Downs) pin their one job;
  // everyone else navigates a projects list.
  const multiJob =
    jobCount > 1 ||
    ctx.allowedEngagementTypes.length > 1 ||
    ctx.defaultEngagementType !== "long_project";

  const sections: NavSection[] = [
    {
      items: [
        { href: p(""), label: "Dashboard", exact: true, icon: "layout-dashboard" },
        { href: p("/assistant"), label: ctx.config.assistant.name, icon: "message-circle" },
        ...(f.chat ? [{ href: p("/chat"), label: L("chat"), icon: "messages-square" }] : []),
        { href: p("/approvals"), label: L("approvals"), badge: counts.pending || undefined, icon: "check-check" },
      ],
    },
    {
      heading: "Delivery",
      items: [
        { href: p("/assess"), label: L("assess"), icon: "clipboard-list" },
        ...(multiJob ? [{ href: p("/projects"), label: L("projects"), icon: "folder-kanban" }] : []),
        { href: p("/phases"), label: L("phases"), icon: "layers" },
        { href: p("/plan"), label: L("plan"), icon: "calendar-range" },
        { href: p("/actions"), label: L("actions"), count: counts.openActions || undefined, icon: "list-todo" },
        { href: p("/decisions"), label: L("decisions"), icon: "scale" },
        ...(f.risks && (profile?.fullRiskRegister ?? true)
          ? [{ href: p("/risks"), label: L("risks"), count: counts.openRisks || undefined, icon: "shield-alert" }]
          : []),
        ...(f.variations
          ? [{ href: p("/variations"), label: L("variations"), count: counts.openVariations || undefined, icon: "git-branch" }]
          : []),
        ...(f.procurement ? [{ href: p("/procurement"), label: L("procurement"), icon: "package" }] : []),
        ...(f.project_plan ? [{ href: p("/project-plan"), label: L("project-plan"), icon: "chart-gantt" }] : []),
        { href: p("/coordination"), label: L("coordination"), icon: "users" },
        { href: p("/comms"), label: L("comms"), icon: "mail" },
        ...(f.room_matrix ? [{ href: p("/room-matrix"), label: L("room-matrix"), icon: "grid-3x3" }] : []),
        ...(f.delay_cascade ? [{ href: p("/delay-cascade"), label: L("delay-cascade"), icon: "clock-alert" }] : []),
      ],
    },
    ...(financial
      ? [
          {
            heading: "Finance",
            items: [
              ...(f.quotes ? [{ href: p("/quotes"), label: L("quotes"), icon: "file-text" }] : []),
              { href: p("/budget"), label: L("budget"), icon: "wallet" },
              { href: p("/cashflow"), label: L("cashflow"), icon: "trending-up" },
            ],
          },
        ]
      : []),
    {
      heading: "Records",
      items: [
        ...(f.documents ? [{ href: p("/documents"), label: L("documents"), icon: "files" }] : []),
        ...(f.meeting_minutes ? [{ href: p("/meeting-minutes"), label: L("meeting-minutes"), icon: "notebook-pen" }] : []),
        ...(f.reports ? [{ href: p("/reports"), label: L("reports"), icon: "chart-column" }] : []),
        ...(f.vendors ? [{ href: p("/vendors"), label: L("vendors"), icon: "store" }] : []),
      ],
    },
    {
      heading: "Automation",
      items: [
        ...(f.learning_rules ? [{ href: p("/learning-rules"), label: L("learning-rules"), icon: "brain" }] : []),
        { href: p("/exec-log"), label: L("exec-log"), icon: "history" },
      ],
    },
  ];

  const admin: NavSection = {
    heading: "Admin",
    items: [
      // Team + agent management are owner-only (requireAdmin on the routes too).
      ...(role.startsWith("owner")
        ? [
            { href: p("/team"), label: L("team"), icon: "users" },
            { href: p("/agents"), label: L("agents"), icon: "bot" },
          ]
        : []),
      ...(f.portal ? [{ href: p("/portal"), label: L("portal"), icon: "globe" }] : []),
      ...(f.accounting ? [{ href: p("/accounting"), label: L("accounting"), icon: "landmark" }] : []),
      { href: p("/integrations"), label: L("integrations"), icon: "plug" },
    ],
  };
  if (admin.items.length) sections.push(admin);

  return sections.filter((s) => s.items.length > 0);
}
