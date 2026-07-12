// Shared submit button for the New-record forms. Creating a record runs a
// server action (Airtable write → revalidate → redirect → re-fetch of the list
// window) that can take several seconds; without a pending state the plain
// button looked dead and the click read as "nothing happened".
"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  label,
  pendingLabel = "Saving…",
}: {
  label: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn-ae inline-flex items-center gap-2 disabled:opacity-60"
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white/40 border-t-white animate-spin"
        />
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}
