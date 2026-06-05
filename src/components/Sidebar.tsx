"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

export function Sidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/uc1" && href !== "/uc2" && href !== "/uc3" && pathname.startsWith(href));

  return (
    <aside className="sidebar w-56 shrink-0 py-4 min-h-[calc(100vh-3.5rem)]">
      {sections.map((section, i) => (
        <div key={i} className="mb-4">
          {section.heading && (
            <div className="px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-wider text-neutral-400">
              {section.heading}
            </div>
          )}
          <nav className="px-2">
            {section.items.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
