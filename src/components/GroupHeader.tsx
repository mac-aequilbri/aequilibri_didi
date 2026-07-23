"use client";

// Group-section headers for list windows using the shared group-by feature.
// A page splits its rows with splitIntoGroups() and renders one of these before
// each section. Two variants for the two list shapes:
//   • GroupHeaderRow — a full-width <tr> for <table>-based lists.
//   • GroupHeading   — a block heading for card/stacked lists.
//
// Both are collapsible. The section's content (data rows, or the card grid)
// is rendered by the server page as *siblings* that follow the header — so
// rather than restructure every window, the header toggles collapse by walking
// its following siblings and setting their `hidden` attribute until it reaches
// the next header (or the end of the container). This is a progressive
// enhancement: with JS off the header is simply a static label, and every
// navigation (filter/sort/page) remounts the header expanded with fresh,
// un-hidden rows, so no stale state can leak across renders.

import { useRef, useState } from "react";

/** Hide/show every sibling after `from` up to the next element carrying
 *  `boundaryClass` (exclusive). Returns nothing; mutates the DOM directly. */
function toggleFollowingSiblings(from: Element, boundaryClass: string, hide: boolean) {
  let el = from.nextElementSibling as HTMLElement | null;
  while (el && !el.classList.contains(boundaryClass)) {
    el.hidden = hide;
    el = el.nextElementSibling as HTMLElement | null;
  }
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <span aria-hidden="true" className="inline-block w-3 text-neutral-400">
      {collapsed ? "▸" : "▾"}
    </span>
  );
}

/** Section header row for a table-based list. `colSpan` must equal the table's
 *  column count so the header spans the full width. */
export function GroupHeaderRow({
  colSpan,
  label,
  count,
}: {
  colSpan: number;
  label: string;
  count: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (rowRef.current) toggleFollowingSiblings(rowRef.current, "group-header-row", next);
  };

  return (
    <tr ref={rowRef} className="group-header-row">
      <td colSpan={colSpan} className="pt-4 pb-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-800"
        >
          <Chevron collapsed={collapsed} />
          <span>{label}</span>
          <span className="font-normal normal-case text-neutral-400 tabular-nums">{count}</span>
        </button>
      </td>
    </tr>
  );
}

/** Section header for a card/stacked list. Collapses the sibling(s) that follow
 *  it (e.g. the section's card grid) up to the next GroupHeading. */
export function GroupHeading({ label, count }: { label: string; count: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (ref.current) toggleFollowingSiblings(ref.current, "group-heading", next);
  };

  return (
    <div ref={ref} className="group-heading mt-4 mb-2 first:mt-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-800"
      >
        <Chevron collapsed={collapsed} />
        <span>{label}</span>
        <span className="font-normal normal-case text-neutral-400 tabular-nums">{count}</span>
      </button>
    </div>
  );
}
