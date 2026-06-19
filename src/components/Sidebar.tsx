"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  /** Highlight only on exact match (root/dashboard items). */
  exact?: boolean;
  /** Prominent count pill (e.g. pending approvals); hidden when 0/undefined. */
  badge?: number;
  /** Quiet informational count (e.g. open risks); hidden when 0/undefined. */
  count?: number;
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export function Sidebar({
  sections,
  orgName,
  menuLabel = "Menu",
  pendingCount = 0,
}: {
  sections: NavSection[];
  /** Shown as the org switcher (org-scoped layouts only). */
  orgName?: string;
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
      <div className="lg:hidden flex items-center gap-3 px-4 py-2 bg-white border-b border-[var(--ae-earth)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          className="text-xl leading-none px-2 py-1 rounded hover:bg-[var(--ae-cream)]"
        >
          ☰
        </button>
        {orgName ? (
          <Link href="/app" className="text-xs text-neutral-700 font-semibold truncate" title="Switch organisation">
            {orgName} <span className="text-neutral-400 font-normal">▾</span>
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
          {orgName ? (
            <Link href="/app" className="hover:underline truncate font-semibold text-neutral-700" title="Switch organisation">
              {orgName} <span className="text-neutral-400 font-normal">▾</span>
            </Link>
          ) : (
            <span className="font-semibold text-neutral-700 truncate">{menuLabel}</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden text-base leading-none px-2 py-0.5 rounded hover:bg-[var(--ae-cream)]"
          >
            ✕
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
                    className="sidebar-section-toggle text-[0.68rem] font-semibold uppercase tracking-wider text-neutral-400"
                  >
                    <span>{section.heading}</span>
                    <span className={`sidebar-section-chevron ${isCollapsed ? "collapsed" : ""}`}>
                      ▾
                    </span>
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
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={isActive(item) ? "active" : ""}
                        >
                          {pill ? (
                            <span className="flex items-center justify-between gap-2">
                              <span>{item.label}</span>
                              {pill}
                            </span>
                          ) : (
                            item.label
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
