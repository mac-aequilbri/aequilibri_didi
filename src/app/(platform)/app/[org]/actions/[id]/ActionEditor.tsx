"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ACTION_STATUSES } from "@/lib/platform/actionStatus";
import type { ActionDetail } from "@/lib/platform/actionsSource";
import { updateActionDetail } from "../actions";

const PRIORITIES = [
  { value: "P1", label: "P1 — urgent" },
  { value: "P2", label: "P2 — normal" },
  { value: "P3", label: "P3 — low" },
];

const inputCls = "mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm";

/** Shape returned by the AI-assist route handler. */
interface AiResponse {
  ok: boolean;
  demo?: boolean;
  error?: string;
  note?: string;
  suggestion?: {
    title?: string;
    detail?: string;
    owner?: string;
    dueDate?: string;
    priority?: string;
    status?: string;
  };
}

function Spinner({ light }: { light?: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 animate-spin ${
        light ? "border-white/40 border-t-white" : "border-neutral-300 border-t-neutral-600"
      }`}
    />
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
  const router = useRouter();

  const [title, setTitle] = useState(action.title);
  const [detail, setDetail] = useState(action.detail);
  const [owner, setOwner] = useState(action.owner);
  const [dueDate, setDueDate] = useState(toDateInput(action.dueDate));
  const [priority, setPriority] = useState(action.priority || "P2");
  const [status, setStatus] = useState(action.status || "open");

  // Save runs the server action; on success we navigate client-side (a redirect
  // inside the action would route through the [org] loading fallback and blank
  // the page). A failed write surfaces its error inline instead of vanishing.
  const [saveState, saveAction, saving] = useActionState(updateActionDetail, null);
  const [navigating, startNav] = useTransition();
  useEffect(() => {
    if (saveState?.ok) startNav(() => router.push(backHref));
  }, [saveState, router, backHref]);

  // AI assist over fetch (not a server action) so the editor stays mounted while
  // it runs — a server action would refresh this force-dynamic route.
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const askAi = async () => {
    setAiLoading(true);
    setAiNote(null);
    setAiError(null);
    try {
      const res = await fetch(`/app/${orgSlug}/actions/${action.id}/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, detail, owner, dueDate, priority, status, issueType: action.issueType }),
      });
      const data = (await res.json()) as AiResponse;
      if (!data.ok) {
        setAiError(data.error ?? "Couldn't get a suggestion. Try again.");
      } else {
        const s = data.suggestion;
        if (s) {
          if (s.title) setTitle(s.title);
          if (s.detail) setDetail(s.detail);
          if (s.owner) setOwner(s.owner);
          if (s.dueDate) setDueDate(s.dueDate);
          if (s.priority) setPriority(s.priority);
          if (s.status) setStatus(s.status);
        }
        setAiNote(data.note ?? "Suggested edits ready — review and save.");
      }
    } catch {
      setAiError("Network error — try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const busy = saving || navigating;

  return (
    <form action={saveAction} className="ae-card p-5 space-y-4">
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="recordId" value={action.id} />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => startNav(() => router.push(backHref))}
          disabled={navigating}
          className="btn-ae-outline text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {navigating ? <Spinner /> : "←"} {navigating ? "Loading…" : "Back to actions"}
        </button>
        <button
          type="button"
          onClick={askAi}
          disabled={aiLoading}
          className="btn-ae-outline text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {aiLoading ? <Spinner /> : "✨"} {aiLoading ? "Thinking…" : "AI suggest / auto-fill"}
        </button>
      </div>

      {aiNote && (
        <p role="status" className="rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-800">
          ✨ {aiNote}
        </p>
      )}
      {aiError && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {aiError}
        </p>
      )}
      {saveState?.error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          Couldn&apos;t save — {saveState.error}
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
        <button type="submit" disabled={busy} className="btn-ae inline-flex items-center gap-1.5 disabled:opacity-60">
          {saving && <Spinner light />}
          {saving ? "Saving…" : navigating ? "Saved — returning…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => startNav(() => router.push(backHref))}
          disabled={busy}
          className="btn-ae-outline inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {navigating && <Spinner />}
          Cancel
        </button>
      </div>
    </form>
  );
}
