// Navigation built from org configuration — the doc's "same architecture,
// different configuration". One nav tree; engagement type and feature flags
// decide which entries appear for a given organisation.

import type { NavSection } from "@/components/Sidebar";
import { orgPath } from "./paths";
import { OrgCtx } from "./types";

/** Live counts surfaced as nav pills. All optional; absent = no pill. */
export interface NavCounts {
  /** Pending approvals — shown as the prominent (terracotta) badge. */
  pending?: number;
  openActions?: number;
  openRisks?: number;
  openVariations?: number;
}

export function buildNav(ctx: OrgCtx, jobCount: number, counts: NavCounts = {}): NavSection[] {
  const f = ctx.config.features;
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
        { href: p(""), label: "Dashboard", exact: true },
        { href: p("/assistant"), label: ctx.config.assistant.name },
        { href: p("/approvals"), label: "Approvals", badge: counts.pending || undefined },
      ],
    },
    {
      heading: "Delivery",
      items: [
        { href: p("/assess"), label: "New Assessment" },
        ...(multiJob ? [{ href: p("/projects"), label: "Projects" }] : []),
        { href: p("/phases"), label: "Phases" },
        { href: p("/actions"), label: "Actions", count: counts.openActions || undefined },
        { href: p("/decisions"), label: "Decisions" },
        ...(f.risks ? [{ href: p("/risks"), label: "Risks", count: counts.openRisks || undefined }] : []),
        ...(f.variations
          ? [{ href: p("/variations"), label: "Variations", count: counts.openVariations || undefined }]
          : []),
        ...(f.procurement ? [{ href: p("/procurement"), label: "Procurement" }] : []),
        ...(f.project_plan ? [{ href: p("/project-plan"), label: "Project Plan" }] : []),
        { href: p("/coordination"), label: "Coordination" },
        ...(f.room_matrix ? [{ href: p("/room-matrix"), label: "Room Matrix" }] : []),
        ...(f.delay_cascade ? [{ href: p("/delay-cascade"), label: "Schedule impact" }] : []),
      ],
    },
    {
      heading: "Finance",
      items: [
        ...(f.quotes ? [{ href: p("/quotes"), label: "Quotes" }] : []),
        { href: p("/budget"), label: "Budget" },
        { href: p("/cashflow"), label: "Cashflow" },
      ],
    },
    {
      heading: "Records",
      items: [
        ...(f.documents ? [{ href: p("/documents"), label: "Documents" }] : []),
        ...(f.meeting_minutes ? [{ href: p("/meeting-minutes"), label: "Meeting Minutes" }] : []),
        ...(f.reports ? [{ href: p("/reports"), label: "Reports" }] : []),
        ...(f.vendors ? [{ href: p("/vendors"), label: "Vendors" }] : []),
      ],
    },
    {
      heading: "Automation",
      items: [
        ...(f.learning_rules ? [{ href: p("/learning-rules"), label: "Automation rules" }] : []),
        { href: p("/exec-log"), label: "Activity" },
      ],
    },
  ];

  const admin: NavSection = {
    heading: "Admin",
    items: [
      ...(f.portal ? [{ href: p("/portal"), label: "Client Portal" }] : []),
      ...(f.accounting ? [{ href: p("/accounting"), label: "Accounting" }] : []),
    ],
  };
  if (admin.items.length) sections.push(admin);

  return sections.filter((s) => s.items.length > 0);
}
