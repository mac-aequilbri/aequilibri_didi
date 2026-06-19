"use client";

// ⌘K / Ctrl-K global search palette. Renders a trigger button (placed by the
// layout) plus a modal that queries the org-scoped /search route as you type.
// Keyboard: ⌘K toggles, ↑/↓ move, Enter opens, Esc closes.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  type: string;
  label: string;
  sublabel?: string;
  href: string;
}

export function CommandSearch({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl-K toggle (and Esc to close).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the input when the palette opens (DOM side-effect only).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search. All state updates happen inside the timeout callback, so
  // nothing sets state synchronously in the effect body.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      if (term.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/app/${orgSlug}/search?q=${encodeURIComponent(term)}`, {
          signal: ctl.signal,
        });
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
        setActive(0);
      } catch {
        /* aborted or failed — leave prior results */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open, orgSlug]);

  const close = () => {
    setOpen(false);
    setQ("");
    setResults([]);
  };

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    close();
    router.push(hit.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cmdk-trigger" aria-label="Search">
        <span className="cmdk-trigger-text">Search…</span>
        <kbd className="cmdk-kbd">⌘K</kbd>
      </button>

      {open && (
        <div className="cmdk-overlay" onClick={close} role="dialog" aria-modal="true" aria-label="Search">
          <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search projects, actions, risks, documents…"
              className="cmdk-input"
              autoComplete="off"
            />
            <div className="cmdk-results">
              {q.trim().length < 2 ? (
                <p className="cmdk-hint">Type at least 2 characters to search.</p>
              ) : loading && results.length === 0 ? (
                <p className="cmdk-hint">Searching…</p>
              ) : results.length === 0 ? (
                <p className="cmdk-hint">No matches for “{q.trim()}”.</p>
              ) : (
                results.map((hit, i) => (
                  <button
                    key={`${hit.href}-${i}`}
                    type="button"
                    onClick={() => go(hit)}
                    onMouseEnter={() => setActive(i)}
                    className={`cmdk-row ${i === active ? "active" : ""}`}
                  >
                    <span className="cmdk-type">{hit.type}</span>
                    <span className="cmdk-label">{hit.label}</span>
                    {hit.sublabel && <span className="cmdk-sub">{hit.sublabel}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
