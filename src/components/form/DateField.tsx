// Shared date field for the New-record forms. Deadline-like dates (due date,
// valid-until) reject past dates: `min` makes native validation block the
// submit, and the inline hint explains why before the user ever hits Save.
// Record-of-fact dates (meeting date, document date) stay unconstrained.
"use client";

import { useState } from "react";

/** Today as the YYYY-MM-DD an <input type="date"> emits, in local time. */
function todayInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function DateField({
  name,
  label,
  required,
  noPast,
}: {
  name: string;
  label: string;
  required?: boolean;
  /** Reject dates before today (native `min` + inline hint). */
  noPast?: boolean;
}) {
  const [value, setValue] = useState("");
  const today = todayInput();
  const isPast = value !== "" && value < today;

  return (
    <label className="block text-sm">
      <span className="text-neutral-600">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type="date"
        name={name}
        required={required}
        value={value}
        min={noPast ? today : undefined}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={noPast && isPast ? `${name}-past-hint` : undefined}
        className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
      />
      {noPast && isPast && (
        <span id={`${name}-past-hint`} className="mt-1 block text-xs text-red-600">
          {label} can’t be in the past — pick today or later.
        </span>
      )}
    </label>
  );
}
