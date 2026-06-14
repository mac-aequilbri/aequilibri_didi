"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  /** Highlight only on exact match (root/dashboard items). */
  exact?: boolean;
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export function Sidebar({
  sections,
  orgName,
  menuLabel = "Menu",
}: {
  sections: NavSection[];
  /** Shown as the "Org: …" switcher (org-scoped layouts only). */
  orgName?: string;
  /** Mobile top-bar label when there's no org switcher. */
  menuLabel?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes (mobile tap-through).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
          <Link href="/app" className="text-xs text-neutral-600 truncate" title="Switch organisation">
            Org: <span className="font-semibold text-neutral-700">{orgName}</span>
          </Link>
        ) : (
          <span className="text-xs font-semibold text-neutral-700 truncate">{menuLabel}</span>
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
            <Link href="/app" className="hover:underline truncate" title="Switch organisation">
              Org: <span className="font-semibold text-neutral-700">{orgName}</span>
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
          {sections.map((section, i) => (
            <div key={i} className="mb-4">
              {section.heading && (
                <div className="px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-wider text-neutral-400">
                  {section.heading}
                </div>
              )}
              <nav className="px-2">
                {section.items.map((item) => (
                  <Link key={item.href} href={item.href} className={isActive(item) ? "active" : ""}>
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
