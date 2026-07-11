"use client";

// Shared filter bar for list windows. Give it a ClientListConfig (from
// toClientConfig) plus the current parsed ListQuery and it renders a search
// box + one pill per filter field: enum pills open a checkbox popover, range
// pills open date inputs. Every change is written to the URL with
// router.replace, so the server component re-reads searchParams and refetches;
// the wrapped children (the list/table) dim while that navigation is pending.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  buildQueryString,
  hasActiveFilters,
  type ClientFilterField,
  type ClientListConfig,
  type FacetCounts,
  type ListQuery,
} from "@/lib/platform/listQuery";

export function FilterBar({
  basePath,
  config,
  query,
  shown,
  total,
  counts,
  searchPlaceholder = "Search…",
  children,
}: {
  /** The window's list route, e.g. orgPath(slug, "/actions"). */
  basePath: string;
  config: ClientListConfig;
  query: ListQuery;
  /** Rows currently displayed / rows before filtering. */
  shown: number;
  total: number;
  /** Optional per-option facet counts (from countEnumOptions). */
  counts?: FacetCounts;
  searchPlaceholder?: string;
  /** The list itself — dimmed while a filter navigation is pending. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openField, setOpenField] = useState<string | null>(null);
  const [search, setSearch] = useState(query.q);
  const barRef = useRef<HTMLDivElement>(null);
  // The latest INTENDED query — every mutation reads from and writes to this
  // ref, never the (possibly one-round-trip-stale) query prop. Without it, a
  // pending search debounce closes over an old query and silently re-applies
  // filters the user just changed (e.g. Clear all → status comes back).
  const latest = useRef(query);

  const navigate = (next: ListQuery) => {
    latest.current = next;
    startTransition(() => {
      router.replace(`${basePath}${buildQueryString(next)}`, { scroll: false });
    });
  };

  // Server round-trip / external URL change → adopt the incoming query. When
  // q differs from what we last navigated to, the change came from outside
  // (back/forward), so sync the input instead of re-navigating.
  useEffect(() => {
    const externalQ = query.q !== latest.current.q;
    latest.current = query;
    if (externalQ) setSearch(query.q);
  }, [query]);

  // Debounced free-text search → URL.
  useEffect(() => {
    const term = search.trim();
    if (term === latest.current.q) return;
    const t = setTimeout(() => navigate({ ...latest.current, q: term }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Close any open popover on outside click or Escape.
  useEffect(() => {
    if (!openField) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenField(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenField(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openField]);

  const toggleEnum = (field: string, value: string) => {
    const base = latest.current;
    const current = base.enums[field] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    navigate({ ...base, enums: { ...base.enums, [field]: next } });
  };

  const setRange = (field: string, part: "from" | "to", value: string) => {
    const base = latest.current;
    const current = { ...(base.ranges[field] ?? {}) };
    if (value) current[part] = value;
    else delete current[part];
    const ranges = { ...base.ranges };
    if (current.from || current.to) ranges[field] = current;
    else delete ranges[field];
    navigate({ ...base, ranges });
  };

  const clearAll = () => {
    setSearch("");
    navigate({ q: "", enums: {}, ranges: {} });
    setOpenField(null);
  };

  const rangeSummary = (r: { from?: string; to?: string }) =>
    r.from && r.to ? `${r.from} – ${r.to}` : r.from ? `≥ ${r.from}` : `≤ ${r.to}`;

  const renderPill = (f: ClientFilterField) => {
    const open = openField === f.name;
    if (f.kind === "enum") {
      const selected = query.enums[f.name] ?? [];
      const active = selected.length > 0;
      return (
        <div key={f.name} className="filter-pill-wrap">
          <button
            type="button"
            className={`filter-pill${active ? " active" : ""}`}
            aria-expanded={open}
            onClick={() => setOpenField(open ? null : f.name)}
          >
            {f.label}
            {active && <span className="filter-pill-count">{selected.length}</span>}
            <span aria-hidden="true">▾</span>
          </button>
          {open && (
            <div className="filter-pop">
              {(f.options ?? []).map((o) => (
                <label key={o.value} className="filter-opt">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => toggleEnum(f.name, o.value)}
                  />
                  <span className="filter-opt-label">{o.label}</span>
                  {counts?.[f.name] && (
                    <span className="filter-opt-count">{counts[f.name][o.value] ?? 0}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      );
    }
    const r = query.ranges[f.name];
    return (
      <div key={f.name} className="filter-pill-wrap">
        <button
          type="button"
          className={`filter-pill${r ? " active" : ""}`}
          aria-expanded={open}
          onClick={() => setOpenField(open ? null : f.name)}
        >
          {f.label}
          {r && <span className="filter-pill-count">{rangeSummary(r)}</span>}
          <span aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="filter-pop filter-range">
            <label>
              From
              <input
                type="date"
                value={r?.from ?? ""}
                onChange={(e) => setRange(f.name, "from", e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={r?.to ?? ""}
                onChange={(e) => setRange(f.name, "to", e.target.value)}
              />
            </label>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div ref={barRef} className="filter-bar">
        {config.hasSearch && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="filter-search"
            aria-label={searchPlaceholder}
          />
        )}
        {config.fields.map(renderPill)}
        {hasActiveFilters(query) && (
          <button type="button" className="filter-clear" onClick={clearAll}>
            Clear all
          </button>
        )}
        <span className="filter-count" role="status">
          {isPending ? "Updating…" : `${shown} of ${total}`}
        </span>
      </div>
      <div className={isPending ? "filter-pending" : undefined}>{children}</div>
    </>
  );
}
