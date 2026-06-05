import { Sidebar, NavSection } from "@/components/Sidebar";

const navSections: NavSection[] = [
  {
    heading: "Didi",
    items: [
      { label: "Dashboard", href: "/uc2" },
      { label: "Chat with Didi", href: "/uc2/chat" },
    ],
  },
  {
    heading: "Data",
    items: [
      { label: "Action Hub", href: "/uc2/actions" },
      { label: "Budget", href: "/uc2/budget" },
      { label: "Cashflow", href: "/uc2/cashflow" },
      { label: "Decisions", href: "/uc2/decisions" },
      { label: "Procurement", href: "/uc2/procurement" },
    ],
  },
  {
    heading: "Project",
    items: [
      { label: "Phases", href: "/uc2/phases" },
      { label: "Project Plan", href: "/uc2/project-plan" },
      { label: "Room Matrix", href: "/uc2/room-matrix" },
      { label: "Documents", href: "/uc2/documents" },
      { label: "Vendors", href: "/uc2/vendors" },
    ],
  },
  {
    heading: "Intelligence",
    items: [
      { label: "Learning Rules", href: "/uc2/learning-rules" },
      { label: "Change Log", href: "/uc2/change-log" },
    ],
  },
];

export default function Uc2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar sections={navSections} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
