import { Sidebar, type NavSection } from "@/components/Sidebar";

const SECTIONS: NavSection[] = [
  {
    heading: "Core",
    items: [
      { href: "/uc1", label: "Dashboard" },
      { href: "/uc1/quotes", label: "Quotes" },
      { href: "/uc1/quotes/new", label: "New Quote" },
      { href: "/uc1/rate-cards", label: "Rate Cards" },
      { href: "/uc1/contacts", label: "Contacts" },
      { href: "/uc1/purchase-orders", label: "Purchase Orders" },
      { href: "/uc1/price-check-log", label: "Price Check Log" },
      { href: "/uc1/measurement-history", label: "Measurement History" },
    ],
  },
  {
    heading: "Revenue Growth",
    items: [
      { href: "/uc1/guttering-rates", label: "Guttering" },
      { href: "/uc1/solar-partners", label: "Solar" },
      { href: "/uc1/finance-providers", label: "Finance" },
      { href: "/uc1/storm", label: "Storm Leads" },
      { href: "/uc1/condition-reports", label: "Condition Reports" },
    ],
  },
  {
    heading: "Intelligence",
    items: [
      { href: "/uc1/roof-inspector", label: "Roof Inspector" },
      { href: "/uc1/intelligence", label: "Contextual Intelligence" },
      { href: "/uc1/action-hub", label: "Action Hub" },
      { href: "/uc1/exec-log", label: "Audit Log" },
    ],
  },
  {
    heading: "Configuration",
    items: [
      { href: "/uc1/workstreams", label: "Workstreams" },
      { href: "/uc1/regions", label: "Regions" },
      { href: "/uc1/team", label: "Team" },
    ],
  },
];

export default function Uc1Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar sections={SECTIONS} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
