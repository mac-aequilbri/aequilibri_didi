"use client";

// Sortable table header — makes <th> cells sort triggers, mirroring the
// FilterBar sort pill (same ?sort=name:dir URL contract from listQuery.ts, so
// the two stay in sync automatically). Click toggles asc → desc; a different
// column starts asc. Page resets so a stale ?page= never strands the user.

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";

export function SortableTh({
  name,
  children,
  className = "py-1 pr-2",
}: {
  /** Sort field name — must match a `config.sort` entry for this list. */
  name: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const current = searchParams.get("sort") ?? "";
  const [field, dir] = current.split(":");
  const active = field === name;
  const nextDir = active && dir === "asc" ? "desc" : "asc";

  const toggle = () => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("sort", `${name}:${nextDir}`);
    p.delete("page");
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-0.5 hover:text-ae-ink ${active ? "text-ae-ink font-semibold" : ""}`}
      >
        {children}
        {active &&
          (dir === "asc" ? (
            <ChevronUp className="h-3 w-3" aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden />
          ))}
      </button>
    </th>
  );
}
