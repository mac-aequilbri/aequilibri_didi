import { Sidebar, NavSection } from "@/components/Sidebar";
import { getActiveTenant } from "@/lib/uc3-tenant";

const navSections: NavSection[] = [
  {
    heading: "Core",
    items: [
      { href: "/uc3", label: "Dashboard" },
      { href: "/uc3/projects", label: "Projects" },
      { href: "/uc3/actions", label: "Actions" },
      { href: "/uc3/risks", label: "Risks" },
      { href: "/uc3/budget", label: "Budget" },
      { href: "/uc3/exec-log", label: "Exec Log" },
    ],
  },
  {
    heading: "Features",
    items: [
      { href: "/uc3/ai-chat", label: "AI Chat" },
      { href: "/uc3/variations", label: "Variations" },
      { href: "/uc3/cashflow", label: "Cashflow" },
      { href: "/uc3/budget-analytics", label: "Budget Analytics" },
    ],
  },
  {
    heading: "Collaboration",
    items: [
      { href: "/uc3/reports", label: "Reports" },
      { href: "/uc3/documents", label: "Documents" },
      { href: "/uc3/meeting-minutes", label: "Meeting Minutes" },
      { href: "/uc3/portal", label: "Client Portal" },
    ],
  },
  {
    heading: "Config",
    items: [
      { href: "/uc3/vendors", label: "Vendors" },
      { href: "/uc3/accounting", label: "Accounting" },
      { href: "/uc3/risk-escalation", label: "Risk Escalation" },
    ],
  },
];

async function TenantBanner() {
  const tenant = await getActiveTenant();
  if (!tenant) return null;
  return (
    <div className="px-4 py-2 text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
      Tenant: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{tenant.name}</span>
    </div>
  );
}

export default function Uc3Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="flex flex-col w-56 shrink-0">
        <TenantBanner />
        <Sidebar sections={navSections} />
      </div>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
