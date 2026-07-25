// Canonical labels for route segments — the single source of truth shared by
// the sidebar nav (nav.ts) and the breadcrumb trail (Breadcrumbs.tsx), so a
// window is always called the same thing everywhere. Dynamic labels (e.g. the
// assistant's per-org name) stay where they're computed; this registry covers
// the static ones. Segments not listed fall back to a humanised slug in the
// breadcrumbs, and numeric ids render as "#<id>".

export const ROUTE_LABELS: Record<string, string> = {
  assistant: "Assistant",
  chat: "Chat",
  approvals: "Approvals",
  assess: "New Assessment",
  projects: "Projects",
  phases: "Phases",
  plan: "Plan",
  actions: "Actions",
  decisions: "Decisions",
  risks: "Risks",
  variations: "Variations",
  procurement: "Procurement",
  "project-plan": "Project Plan",
  coordination: "Coordination",
  comms: "Comms",
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
  team: "Team & access",
  agents: "AI agents",
  portal: "Client Portal",
  accounting: "Accounting",
  integrations: "Integrations",
  // Breadcrumb-only segments (sub-routes without nav entries).
  models: "Models",
  new: "New",
  escalation: "Escalation",
  print: "Print",
};
