"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrgLogo } from "./OrgLogo";

// Friendly labels for path segments — kept in sync with the nav. Anything not
// listed falls back to a humanised slug, and numeric ids render as "#<id>".
const LABELS: Record<string, string> = {
  assistant: "Assistant",
  approvals: "Approvals",
  assess: "New Assessment",
  projects: "Projects",
  phases: "Phases",
  actions: "Actions",
  decisions: "Decisions",
  risks: "Risks",
  variations: "Variations",
  procurement: "Procurement",
  "project-plan": "Project Plan",
  "room-matrix": "Room Matrix",
  "delay-cascade": "Schedule impact",
  quotes: "Quotes",
  budget: "Budget",
  cashflow: "Cashflow",
  documents: "Documents",
  "meeting-minutes": "Meeting Minutes",
  reports: "Reports",
  vendors: "Vendors",
  "learning-rules": "Automation rules",
  "exec-log": "Activity",
  portal: "Client Portal",
  accounting: "Accounting",
  models: "Models",
  new: "New",
  escalation: "Escalation",
  print: "Print",
};

const labelFor = (seg: string) =>
  LABELS[seg] ?? (/^\d+$/.test(seg) ? `#${seg}` : seg.replace(/-/g, " "));

export function Breadcrumbs({
  orgName,
  orgSlug,
  orgLogo,
}: {
  orgName: string;
  orgSlug: string;
  orgLogo?: string;
}) {
  const pathname = usePathname();
  const base = `/app/${orgSlug}`;
  if (!pathname.startsWith(base)) return null;

  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  // Dashboard root already names the org in its page header — no crumb needed.
  if (rest.length === 0) return null;

  const crumbs = rest.map((seg, i) => ({
    label: labelFor(seg),
    href: `${base}/${rest.slice(0, i + 1).join("/")}`,
  }));

  return (
    <nav aria-label="Breadcrumb" className="ae-breadcrumbs">
      {orgLogo && <OrgLogo logo={orgLogo} name={orgName} size={18} className="align-middle" />}
      <Link href={base} className="ae-crumb-link">
        {orgName}
      </Link>
      {crumbs.map((c, i) => (
        <Fragment key={c.href}>
          <span className="ae-crumb-sep" aria-hidden="true">
            ›
          </span>
          {i === crumbs.length - 1 ? (
            <span className="ae-crumb-current" aria-current="page">
              {c.label}
            </span>
          ) : (
            <Link href={c.href} className="ae-crumb-link">
              {c.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
