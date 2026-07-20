// Small copy-to-clipboard button with transient "Copied" feedback. Used for
// portal links, webhook endpoints/bodies and the signing secret — anywhere a
// value must land in the clipboard exactly (hand-selecting monospace strings
// is error-prone).
"use client";

import { useEffect, useRef, useState } from "react";

export function CopyButton({
  value,
  path,
  label = "Copy",
  copiedLabel = "Copied ✓",
  className = "",
  title,
  autoFocus = false,
}: {
  /** Exact text to copy. Ignored when `path` is set. */
  value?: string;
  /** Copy `window.location.origin + path` — for full public URLs the server
   *  can't cheaply know (proxies, preview hosts). */
  path?: string;
  label?: string;
  copiedLabel?: string;
  /** Extra classes appended to the base pill styling (e.g. a highlight ring). */
  className?: string;
  title?: string;
  /** Focus on mount — draws the eye to a just-issued row. */
  autoFocus?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!copied) return;
    timer.current = setTimeout(() => setCopied(false), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [copied]);

  const copy = async () => {
    const text = path ? `${window.location.origin}${path}` : (value ?? "");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context — fall back to the legacy path.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      autoFocus={autoFocus}
      aria-live="polite"
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-neutral-300 bg-white text-neutral-600 hover:border-[var(--ae-space)] hover:text-[var(--ae-space-deep)]"
      } ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
