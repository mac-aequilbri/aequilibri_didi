"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  Brain,
  CalendarRange,
  ChartColumn,
  ChartGantt,
  CheckCheck,
  ChevronDown,
  ChevronsUpDown,
  ClipboardList,
  ClockAlert,
  FileText,
  Files,
  FolderKanban,
  GitBranch,
  Globe,
  Grid3x3,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  ListTodo,
  Mail,
  Menu,
  MessageCircle,
  MessagesSquare,
  NotebookPen,
  Package,
  Plug,
  Scale,
  ShieldAlert,
  Store,
  TrendingUp,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { OrgLogo } from "./OrgLogo";

// Lucide components for the icon name strings nav.ts assigns. Items without a
// matching entry (or with no icon at all — e.g. the UC1 shell's hardcoded
// sections) simply render label-only.
const NAV_ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "message-circle": MessageCircle,
  "messages-square": MessagesSquare,
  "check-check": CheckCheck,
  "clipboard-list": ClipboardList,
  "folder-kanban": FolderKanban,
  layers: Layers,
  "calendar-range": CalendarRange,
  "list-todo": ListTodo,
  scale: Scale,
  "shield-alert": ShieldAlert,
  "git-branch": GitBranch,
  package: Package,
  "chart-gantt": ChartGantt,
  users: Users,
  mail: Mail,
  "grid-3x3": Grid3x3,
  "clock-alert": ClockAlert,
  "file-text": FileText,
  wallet: Wallet,
  "trending-up": TrendingUp,
  files: Files,
  "notebook-pen": NotebookPen,
  "chart-column": ChartColumn,
  store: Store,
  brain: Brain,
  history: History,
  bot: Bot,
  globe: Globe,
  landmark: Landmark,
  plug: Plug,
};

export interface NavItem {
  href: string;
  label: string;
  /** Highlight only on exact match (root/dashboard items). */
  exact?: boolean;
  /** Prominent count pill (e.g. pending approvals); hidden when 0/undefined. */
  badge?: number;
  /** Quiet informational count (e.g. open risks); hidden when 0/undefined. */
  count?: number;
  /** Lucide icon name (see NAV_ICONS in Sidebar.tsx); absent = label only. */
  icon?: string;
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export function Sidebar({
  sections,
  orgName,
  orgLogo,
  menuLabel = "Menu",
  pendingCount = 0,
}: {
  sections: NavSection[];
  /** Shown as the org switcher (org-scoped layouts only). */
  orgName?: string;
  /** Customer logo (data URL) shown beside the org name. */
  orgLogo?: string;
  /** Mobile top-bar label when there's no org switcher. */
  menuLabel?: string;
  /** Pending approvals — surfaced as a badge in the mobile top bar. */
  pendingCount?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Per-section collapse, in-memory: the layout (and this component) persists
  // across in-app navigation, so collapsed groups stay collapsed as you move
  // around — only a full reload resets them.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (heading: string) =>
    setCollapsed((prev) => ({ ...prev, [heading]: !prev[heading] }));

  // Close the drawer when the route changes (mobile tap-through) — handled
  // during render rather than in an effect.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    if (open) setOpen(false);
  }

  const isActive = (item: NavItem) =>
    pathname === item.href ||
    (!item.exact &&
      item.href !== "/uc1" &&
      item.href !== "/uc2" &&
      item.href !== "/uc3" &&
      pathname.startsWith(item.href));

  return (
    <>
      {/* Mobile top bar — hamburger + current org (hidden on desktop). */}
      <div className="lg:hidden print:hidden flex items-center gap-3 px-4 py-2 bg-white border-b border-[var(--ae-earth)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          className="leading-none px-2 py-1 rounded hover:bg-[var(--ae-cream)]"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <OrgLogo logo={orgLogo} name={orgName} size={24} />
        {orgName ? (
          <Link
            href="/app"
            className="flex items-center gap-1 min-w-0 text-xs text-neutral-700 font-semibold"
            title="Switch organisation"
          >
            <span className="truncate">{orgName}</span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 text-neutral-400" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-xs font-semibold text-neutral-700 truncate">{menuLabel}</span>
        )}
        {pendingCount > 0 && (
          <span className="nav-badge nav-badge-mobile ml-auto" title={`${pendingCount} awaiting approval`}>
            {pendingCount}
          </span>
        )}
      </div>

      {/* Backdrop behind the drawer (mobile only). */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: static column on desktop, off-canvas drawer on mobile. */}
      <div
        className={`sidebar flex flex-col w-64 lg:w-56 shrink-0 z-50 overflow-y-auto
          fixed inset-y-0 left-0 transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0 lg:transition-none`}
      >
        <div className="px-4 py-2 text-xs text-neutral-500 border-b border-[var(--ae-earth)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <OrgLogo logo={orgLogo} name={orgName} size={28} />
            {orgName ? (
              <Link
                href="/app"
                className="flex items-center gap-1 min-w-0 hover:underline font-semibold text-neutral-700"
                title="Switch organisation"
              >
                <span className="truncate">{orgName}</span>
                <ChevronsUpDown className="h-3 w-3 shrink-0 text-neutral-400" aria-hidden="true" />
              </Link>
            ) : (
              <span className="font-semibold text-neutral-700 truncate">{menuLabel}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden leading-none px-2 py-0.5 rounded hover:bg-[var(--ae-cream)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="py-4">
          {sections.map((section, i) => {
            const isCollapsed = section.heading ? !!collapsed[section.heading] : false;
            return (
              <div key={i} className="mb-4">
                {section.heading && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.heading!)}
                    aria-expanded={!isCollapsed}
                    className="sidebar-section-toggle text-[0.68rem] font-semibold uppercase tracking-wider text-neutral-500"
                  >
                    <span>{section.heading}</span>
                    <ChevronDown
                      className={`sidebar-section-chevron h-3.5 w-3.5 ${isCollapsed ? "collapsed" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                )}
                {!isCollapsed && (
                  <nav className="px-2">
                    {section.items.map((item) => {
                      const pill = item.badge ? (
                        <span className="nav-badge">{item.badge}</span>
                      ) : item.count ? (
                        <span className="nav-count">{item.count}</span>
                      ) : null;
                      // Icon is optional — UC1's hardcoded sections carry none.
                      const Icon = item.icon ? NAV_ICONS[item.icon] : undefined;
                      const label = Icon ? (
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </span>
                      ) : (
                        item.label
                      );
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={isActive(item) ? "active" : ""}
                        >
                          {pill ? (
                            <span className="flex items-center justify-between gap-2">
                              {label}
                              {pill}
                            </span>
                          ) : (
                            label
                          )}
                        </Link>
                      );
                    })}
                  </nav>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
