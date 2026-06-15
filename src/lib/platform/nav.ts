// Navigation built from org configuration — the doc's "same architecture,
// different configuration". One nav tree; engagement type and feature flags
// decide which entries appear for a given organisation.

import type { NavSection } from "@/components/Sidebar";
import { orgPath } from "./paths";
import { OrgCtx } from "./types";

export function buildNav(ctx: OrgCtx, jobCount: number): NavSection[] {
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
      ],
    },
    {
      heading: "Delivery",
      items: [
        { href: p("/assess"), label: "New Assessment" },
        ...(multiJob ? [{ href: p("/projects"), label: "Projects" }] : []),
        { href: p("/phases"), label: "Phases" },
        { href: p("/actions"), label: "Actions" },
        { href: p("/decisions"), label: "Decisions" },
        ...(f.risks ? [{ href: p("/risks"), label: "Risks" }] : []),
        ...(f.variations ? [{ href: p("/variations"), label: "Variations" }] : []),
        ...(f.procurement ? [{ href: p("/procurement"), label: "Procurement" }] : []),
        ...(f.project_plan ? [{ href: p("/project-plan"), label: "Project Plan" }] : []),
        ...(f.room_matrix ? [{ href: p("/room-matrix"), label: "Room Matrix" }] : []),
        ...(f.delay_cascade ? [{ href: p("/delay-cascade"), label: "Delay Cascade" }] : []),
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
      heading: "Intelligence",
      items: [
        ...(f.learning_rules ? [{ href: p("/learning-rules"), label: "Learning Rules" }] : []),
        { href: p("/exec-log"), label: "Execution Log" },
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
