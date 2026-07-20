"use client";

// ⌘K / Ctrl-K global search palette. Renders a trigger button (placed by the
// layout) plus a modal that queries the org-scoped /search route as you type.
// Keyboard: ⌘K toggles, ↑/↓ move, Enter opens, Esc closes.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

// Hydration-safe client-only read: the server snapshot is null, so SSR and the
// first client render agree; the real value appears right after hydration.
const emptySubscribe = () => () => {};
const useKbdHint = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => (/mac/i.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => null,
  );

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
  const [error, setError] = useState(false);
  // Platform-aware shortcut hint — null during SSR/hydration, filled on the client.
  const kbdHint = useKbdHint();
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
        setError(false);
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
        setError(false);
      } catch {
        // Aborted (superseded keystroke) — leave prior results; real failures
        // surface an error line in the results panel.
        if (!ctl.signal.aborted) setError(true);
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
    setError(false);
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
        {kbdHint && <kbd className="cmdk-kbd">{kbdHint}</kbd>}
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
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="cmdk-listbox"
              aria-activedescendant={results.length > 0 ? `cmdk-option-${active}` : undefined}
            />
            <div className="cmdk-results" id="cmdk-listbox" role="listbox" aria-label="Search results">
              {error && q.trim().length >= 2 ? (
                <p className="cmdk-hint">Search is unavailable — try again.</p>
              ) : q.trim().length < 2 ? (
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
                    id={`cmdk-option-${i}`}
                    role="option"
                    aria-selected={i === active}
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
