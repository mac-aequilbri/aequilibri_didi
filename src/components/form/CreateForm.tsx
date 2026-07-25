"use client";

// Client shell for create forms — replaces the redirect-with-?error= pattern
// that lost all typed input on a failed save. The server action returns
// { error } instead of redirecting on failure; because the fields are
// uncontrolled inputs rendered as children (RSC composition), the browser
// keeps every value the user typed while the error shows inline. On success
// the action still redirect()s (to the new record or the list) as before.
//
// Usage (page stays a server component):
//   <CreateForm action={createRisk} submitLabel="Add risk" pendingLabel="Adding…">
//     …existing field markup…
//   </CreateForm>

import { useActionState } from "react";
import { MessageBar } from "@/components/ui/MessageBar";
import { SubmitButton } from "./SubmitButton";

export type CreateFormState = { error: string } | null;

export function CreateForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  className = "ae-card p-5 space-y-4",
  footer,
}: {
  action: (prev: CreateFormState, formData: FormData) => Promise<CreateFormState>;
  submitLabel: string;
  pendingLabel?: string;
  children: React.ReactNode;
  className?: string;
  /** Extra content rendered beside the submit button (e.g. a cancel link). */
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {state?.error && <MessageBar variant="danger">{state.error}</MessageBar>}
      {children}
      <div className="flex items-center gap-3 pt-1">
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel ?? "Saving…"} />
        {footer}
      </div>
    </form>
  );
}
