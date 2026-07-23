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
  PAGE_SIZE_OPTIONS,
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
  page = 1,
  pageCount = 1,
  searchPlaceholder = "Search…",
  children,
}: {
  /** The window's list route, e.g. orgPath(slug, "/actions"). */
  basePath: string;
  config: ClientListConfig;
  query: ListQuery;
  /** Rows matching the filters / rows before filtering. */
  shown: number;
  total: number;
  /** Optional per-option facet counts (from countEnumOptions). */
  counts?: FacetCounts;
  /** Current page + page count (from applyListQuery/sortAndPaginate); a pager
   *  renders below children when pageCount > 1. */
  page?: number;
  pageCount?: number;
  searchPlaceholder?: string;
  /** The list itself — dimmed while a filter navigation is pending. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openField, setOpenField] = useState<string | null>(null);
  const [search, setSearch] = useState(query.q);
  const barRef = useRef<HTMLDivElement>(null);
  // Only one popover is open at a time, so a single ref covers whichever is
  // mounted; pillRefs lets Escape hand focus back to the pill that opened it.
  const popRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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

  // Debounced free-text search → URL (any filter change restarts at page 1).
  useEffect(() => {
    const term = search.trim();
    if (term === latest.current.q) return;
    const t = setTimeout(() => navigate({ ...latest.current, q: term, page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // When a popover opens, move focus to its first control so keyboard users
  // land inside it rather than having to tab past the rest of the bar.
  useEffect(() => {
    if (!openField) return;
    popRef.current
      ?.querySelector<HTMLElement>("input, select, button, [tabindex]:not([tabindex='-1'])")
      ?.focus();
  }, [openField]);

  // Close any open popover on outside click or Escape (Escape hands focus
  // back to the pill button that opened it).
  useEffect(() => {
    if (!openField) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenField(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenField(null);
        pillRefs.current[openField]?.focus();
      }
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
    navigate({ ...base, enums: { ...base.enums, [field]: next }, page: 1 });
  };

  const setRange = (field: string, part: "from" | "to", value: string) => {
    const base = latest.current;
    const current = { ...(base.ranges[field] ?? {}) };
    if (value) current[part] = value;
    else delete current[part];
    const ranges = { ...base.ranges };
    if (current.from || current.to) ranges[field] = current;
    else delete ranges[field];
    navigate({ ...base, ranges, page: 1 });
  };

  // Same field again toggles direction; "Default order" clears the sort.
  const setSort = (field: string | null) => {
    const base = latest.current;
    const sort =
      field === null
        ? null
        : base.sort?.field === field
          ? { field, dir: base.sort.dir === "asc" ? ("desc" as const) : ("asc" as const) }
          : { field, dir: "asc" as const };
    navigate({ ...base, sort, page: 1 });
  };

  // Selecting a dimension groups by it; "No grouping" clears it.
  const setGroup = (field: string | null) =>
    navigate({ ...latest.current, group: field, page: 1 });

  const goToPage = (p: number) => navigate({ ...latest.current, page: p });

  // Chosen size only goes to the URL when it differs from the config default.
  const setPageSize = (size: number) =>
    navigate({
      ...latest.current,
      pageSize: size === config.pageSize ? null : size,
      page: 1,
    });

  const clearAll = () => {
    setSearch("");
    navigate({
      q: "",
      enums: {},
      ranges: {},
      sort: latest.current.sort,
      group: latest.current.group,
      pageSize: latest.current.pageSize,
      page: 1,
    });
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
            ref={(el) => {
              pillRefs.current[f.name] = el;
            }}
            className={`filter-pill${active ? " active" : ""}`}
            aria-expanded={open}
            onClick={() => setOpenField(open ? null : f.name)}
          >
            {f.label}
            {active && <span className="filter-pill-count">{selected.length}</span>}
            <span aria-hidden="true">▾</span>
          </button>
          {open && (
            <div className="filter-pop" ref={popRef}>
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
          ref={(el) => {
            pillRefs.current[f.name] = el;
          }}
          className={`filter-pill${r ? " active" : ""}`}
          aria-expanded={open}
          onClick={() => setOpenField(open ? null : f.name)}
        >
          {f.label}
          {r && <span className="filter-pill-count">{rangeSummary(r)}</span>}
          <span aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="filter-pop filter-range" ref={popRef}>
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

  const sortOpen = openField === "__sort";
  const activeSort = query.sort
    ? config.sort?.find((s) => s.name === query.sort?.field)
    : undefined;

  const groupOpen = openField === "__group";
  const activeGroup = query.group
    ? config.groups?.find((g) => g.name === query.group)
    : undefined;

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
        {(config.sort?.length ?? 0) > 0 && (
          <div className="filter-pill-wrap">
            <button
              type="button"
              ref={(el) => {
                pillRefs.current["__sort"] = el;
              }}
              className={`filter-pill${activeSort ? " active" : ""}`}
              aria-expanded={sortOpen}
              onClick={() => setOpenField(sortOpen ? null : "__sort")}
            >
              Sort
              {activeSort && (
                <span className="filter-pill-count">
                  {activeSort.label} {query.sort?.dir === "desc" ? "↓" : "↑"}
                </span>
              )}
              <span aria-hidden="true">▾</span>
            </button>
            {sortOpen && (
              <div className="filter-pop" ref={popRef}>
                {config.sort?.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    className="filter-opt filter-opt-btn"
                    onClick={() => setSort(s.name)}
                  >
                    <span className="filter-opt-label">{s.label}</span>
                    {query.sort?.field === s.name && (
                      <span className="filter-opt-count">
                        {query.sort.dir === "desc" ? "↓ desc" : "↑ asc"}
                      </span>
                    )}
                  </button>
                ))}
                {query.sort && (
                  <button
                    type="button"
                    className="filter-opt filter-opt-btn"
                    onClick={() => setSort(null)}
                  >
                    <span className="filter-opt-label">Default order</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {(config.groups?.length ?? 0) > 0 && (
          <div className="filter-pill-wrap">
            <button
              type="button"
              ref={(el) => {
                pillRefs.current["__group"] = el;
              }}
              className={`filter-pill${activeGroup ? " active" : ""}`}
              aria-expanded={groupOpen}
              onClick={() => setOpenField(groupOpen ? null : "__group")}
            >
              Group
              {activeGroup && <span className="filter-pill-count">{activeGroup.label}</span>}
              <span aria-hidden="true">▾</span>
            </button>
            {groupOpen && (
              <div className="filter-pop" ref={popRef}>
                {config.groups?.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    className="filter-opt filter-opt-btn"
                    onClick={() => setGroup(g.name)}
                  >
                    <span className="filter-opt-label">{g.label}</span>
                    {query.group === g.name && <span className="filter-opt-count">✓</span>}
                  </button>
                ))}
                {query.group && (
                  <button
                    type="button"
                    className="filter-opt filter-opt-btn"
                    onClick={() => setGroup(null)}
                  >
                    <span className="filter-opt-label">No grouping</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {hasActiveFilters(query) && (
          <button type="button" className="filter-clear" onClick={clearAll}>
            Clear all
          </button>
        )}
        <span className="filter-count" role="status">
          {isPending ? "Updating…" : `${shown} of ${total}`}
        </span>
        {config.pageSize !== undefined && (
          <label className="filter-psize">
            Rows
            <select
              value={query.pageSize ?? config.pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {[...new Set([...PAGE_SIZE_OPTIONS, config.pageSize])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <div className={isPending ? "filter-pending" : undefined}>{children}</div>
      {pageCount > 1 && (
        <div className="filter-pager">
          <button
            type="button"
            className="btn-ae-outline text-xs disabled:opacity-40"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || isPending}
          >
            ← Prev
          </button>
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="btn-ae-outline text-xs disabled:opacity-40"
            onClick={() => goToPage(page + 1)}
            disabled={page >= pageCount || isPending}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}
