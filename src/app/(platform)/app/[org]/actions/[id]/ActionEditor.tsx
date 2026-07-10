"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ACTION_STATUSES } from "@/lib/platform/actionStatus";
import type { ActionDetail } from "@/lib/platform/actionsSource";
import { suggestActionEdits, updateActionDetail } from "../actions";

const PRIORITIES = [
  { value: "P1", label: "P1 — urgent" },
  { value: "P2", label: "P2 — normal" },
  { value: "P3", label: "P3 — low" },
];

const inputCls = "mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ae disabled:opacity-60" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

/** Format a Date as the YYYY-MM-DD an <input type="date"> expects. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return iso.slice(0, 10);
}

export default function ActionEditor({
  orgSlug,
  action,
  backHref,
}: {
  orgSlug: string;
  action: ActionDetail;
  backHref: string;
}) {
  const [title, setTitle] = useState(action.title);
  const [detail, setDetail] = useState(action.detail);
  const [owner, setOwner] = useState(action.owner);
  const [dueDate, setDueDate] = useState(toDateInput(action.dueDate));
  const [priority, setPriority] = useState(action.priority || "P2");
  const [status, setStatus] = useState(action.status || "open");

  const [aiState, runAi, aiPending] = useActionState(suggestActionEdits, null);

  // When a suggestion comes back, fill the fields the model actually proposed —
  // leaving the rest as the user has them. The user reviews, then Saves.
  useEffect(() => {
    const s = aiState?.suggestion;
    if (!s) return;
    if (s.title) setTitle(s.title);
    if (s.detail) setDetail(s.detail);
    if (s.owner) setOwner(s.owner);
    if (s.dueDate) setDueDate(s.dueDate);
    if (s.priority) setPriority(s.priority);
    if (s.status) setStatus(s.status);
  }, [aiState]);

  // The AI-assist runs the same server action shape as useActionState expects —
  // hand it the current (possibly unsaved) field values as context.
  const askAi = () => {
    const fd = new FormData();
    fd.set("org", orgSlug);
    fd.set("title", title);
    fd.set("detail", detail);
    fd.set("owner", owner);
    fd.set("dueDate", dueDate);
    fd.set("priority", priority);
    fd.set("status", status);
    fd.set("issueType", action.issueType);
    runAi(fd);
  };

  return (
    <form action={updateActionDetail} className="ae-card p-5 space-y-4">
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="recordId" value={action.id} />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500">
          {action.jobCode ? `${action.jobCode} · ` : ""}
          {action.issueType || "Action"}
        </span>
        <button
          type="button"
          onClick={askAi}
          disabled={aiPending}
          className="btn-ae-outline text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {aiPending && (
            <span
              aria-hidden
              className="h-3 w-3 rounded-full border-2 border-neutral-300 border-t-neutral-600 animate-spin"
            />
          )}
          {aiPending ? "Thinking…" : "✨ AI suggest / auto-fill"}
        </button>
      </div>

      {aiState?.note && !aiState.error && (
        <p
          role="status"
          className="rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-800"
        >
          {aiState.demo ? "🛈 " : "✨ "}
          {aiState.note}
        </p>
      )}
      {aiState?.error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {aiState.error}
        </p>
      )}

      <label className="block text-sm">
        <span className="text-neutral-600">Title</span>
        <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600">Description</span>
        <textarea
          name="detail"
          rows={4}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          className={inputCls}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-600">Owner</span>
          <input name="owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Due date</span>
          <input
            type="date"
            name="dueDate"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Priority</span>
          <select name="priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Status</span>
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SaveButton />
        <Link href={backHref} className="btn-ae-outline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
