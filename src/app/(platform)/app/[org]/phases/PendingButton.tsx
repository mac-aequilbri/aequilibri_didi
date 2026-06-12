// Submit button that disables itself and swaps its label while the enclosing
// form's server action runs — the evidence AI review takes several seconds.
"use client";

import { useFormStatus } from "react-dom";

export function PendingButton({
  children,
  pendingLabel,
  outline = false,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  outline?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${outline ? "btn-ae-outline" : "btn-ae"} text-xs disabled:opacity-50`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
