// Two-step confirm for destructive/irreversible server-action buttons: the
// first click arms the button (label swaps to the confirm text), the second
// submits. Replaces window.confirm (unstyled, blocking) and bare one-click
// destructive submits without needing modal plumbing in server components.
"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  label,
  confirmLabel = "Click again to confirm",
  pendingLabel = "Working…",
  className = "btn-ae-outline",
  title,
  formAction,
}: {
  label: string;
  /** Shown after the first (arming) click — state what will happen. */
  confirmLabel?: string;
  pendingLabel?: string;
  className?: string;
  title?: string;
  /** Per-button server action override (React <button formAction>). */
  formAction?: ComponentProps<"button">["formAction"];
}) {
  const { pending } = useFormStatus();
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Disarm after a few seconds so a stale armed button can't fire later.
  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), 5000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title={title}
      formAction={formAction}
      onClick={(e) => {
        if (!armed && !pending) {
          e.preventDefault();
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
      className={`${className} inline-flex items-center gap-2 disabled:opacity-60`}
      // Armed state tints to the warm brand danger colour. Inline style (not a
      // Tailwind important utility) so it reliably overrides the base variant's
      // border/text colour regardless of which `className` variant is passed.
      style={armed ? { borderColor: "var(--ae-danger)", color: "var(--ae-danger)" } : undefined}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current/40 border-t-current animate-spin"
        />
      )}
      {pending ? pendingLabel : armed ? confirmLabel : label}
    </button>
  );
}
