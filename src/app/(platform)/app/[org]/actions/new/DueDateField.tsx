// Due-date field for the New Action form. A past date is legitimate here (you
// may be logging an action that is already overdue), so this doesn't block the
// write — it just surfaces a non-blocking hint so a past date is acknowledged
// rather than silently accepted.
"use client";

import { useState } from "react";

/** Today as the YYYY-MM-DD an <input type="date"> emits, in local time. */
function todayInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function DueDateField() {
  const [value, setValue] = useState("");
  const isPast = value !== "" && value < todayInput();

  return (
    <label className="block text-sm">
      <span className="text-neutral-600">Due date</span>
      <input
        type="date"
        name="dueDate"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={isPast ? "dueDate-past-hint" : undefined}
        className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
      />
      {isPast && (
        <span id="dueDate-past-hint" className="mt-1 block text-xs text-amber-600">
          That date is in the past — this action will be created overdue.
        </span>
      )}
    </label>
  );
}
