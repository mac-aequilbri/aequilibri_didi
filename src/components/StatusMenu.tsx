"use client";

// Status cell as a click-to-change menu: the StatusBadge itself is the trigger,
// and picking an option submits the row's server action immediately — replaces
// the inline select + "Set" button forms on list rows. Reuses the FilterBar
// popover CSS (.filter-pop/.filter-opt) so the two menus look identical.

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/PageHeader";

export function StatusMenu({
  action,
  org,
  recordId,
  current,
  options,
  label,
  badgeStatus,
}: {
  /** Server action taking FormData with org/recordId/status. */
  action: (formData: FormData) => Promise<void>;
  org: string;
  recordId: string;
  current: string;
  options: readonly string[];
  /** Accessible name, e.g. `Status for ${title}`. */
  label: string;
  /** What the badge shows when it differs from the stored value (e.g. "overdue"). */
  badgeStatus?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Humanise option labels locally (a formatter prop would be a function
  // crossing the server→client boundary, which RSC serialization rejects).
  const fmt = (s: string) => s.replace(/_/g, " ");
  const choose = (s: string) => {
    setOpen(false);
    btnRef.current?.focus();
    if (s === current) return;
    const fd = new FormData();
    fd.set("org", org);
    fd.set("recordId", recordId);
    fd.set("status", s);
    startTransition(() => action(fd));
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={pending}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 ${pending ? "opacity-50" : ""}`}
      >
        <StatusBadge status={badgeStatus ?? current} />
        <ChevronDown className="h-3 w-3 text-neutral-500" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label={label} className="filter-pop" style={{ minWidth: "10rem" }}>
          {options.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === current}
              onClick={() => choose(s)}
              className="filter-opt filter-opt-btn"
            >
              <span className="filter-opt-label">{fmt(s)}</span>
              {s === current && <Check className="h-3 w-3" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
