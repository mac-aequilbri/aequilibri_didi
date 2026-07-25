"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteChatAction, renameChatAction } from "./actions";

export interface ConversationView {
  id: number | string;
  title: string;
}

/** Sidebar list of standalone conversations with inline rename and delete.
 *  Both controls submit server actions (imported from ./actions) that redirect,
 *  so a successful action re-renders the whole list from the server. */
export default function ConversationList({
  orgSlug,
  chatPath,
  currentId,
  sessions,
}: {
  orgSlug: string;
  chatPath: string;
  currentId: number | string;
  sessions: ConversationView[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // Two-step delete (same arm/confirm idiom as ConfirmSubmitButton): the first
  // click arms the row's delete button, the second submits. Auto-disarms so a
  // stale armed button can't delete later.
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  useEffect(() => {
    if (armedDeleteId === null) return;
    const t = setTimeout(() => setArmedDeleteId(null), 5000);
    return () => clearTimeout(t);
  }, [armedDeleteId]);

  if (sessions.length === 0) {
    return <p className="px-2.5 text-xs text-neutral-500">No conversations yet.</p>;
  }

  return (
    <ul className="space-y-1">
      {sessions.map((s) => {
        const id = String(s.id);
        const active = id === String(currentId);

        if (editingId === id) {
          return (
            <li key={id}>
              <form
                action={renameChatAction}
                className="flex items-center gap-1"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingId(null);
                }}
              >
                <input type="hidden" name="org" value={orgSlug} />
                <input type="hidden" name="sessionId" value={id} />
                <input
                  name="title"
                  defaultValue={s.title}
                  autoFocus
                  maxLength={80}
                  aria-label="Conversation name"
                  className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm focus:border-ae-space focus:outline-none"
                />
                <button type="submit" className="shrink-0 text-xs text-ae-space hover:underline">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="shrink-0 text-xs text-neutral-500 hover:text-neutral-600"
                >
                  Cancel
                </button>
              </form>
            </li>
          );
        }

        return (
          <li key={id} className="group flex items-center gap-1">
            <Link
              href={`${chatPath}?s=${id}`}
              className={`block min-w-0 flex-1 truncate rounded px-2.5 py-1.5 text-sm ${
                active
                  ? "bg-neutral-100 font-medium text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {s.title}
            </Link>
            <button
              type="button"
              onClick={() => setEditingId(id)}
              aria-label={`Rename ${s.title}`}
              title="Rename"
              className="shrink-0 px-1 text-neutral-500 hover:text-neutral-700 lg:opacity-0 lg:group-hover:opacity-100"
            >
              ✎
            </button>
            <form
              action={deleteChatAction}
              onSubmit={(e) => {
                if (armedDeleteId !== id) {
                  e.preventDefault();
                  setArmedDeleteId(id);
                }
              }}
            >
              <input type="hidden" name="org" value={orgSlug} />
              <input type="hidden" name="sessionId" value={id} />
              <button
                type="submit"
                aria-label={
                  armedDeleteId === id
                    ? `Confirm delete ${s.title} — this can't be undone`
                    : `Delete ${s.title}`
                }
                title={armedDeleteId === id ? "Click again to confirm — can't be undone" : "Delete"}
                onBlur={() => setArmedDeleteId(null)}
                className={
                  armedDeleteId === id
                    ? "shrink-0 px-1 text-xs font-medium text-ae-danger whitespace-nowrap"
                    : "shrink-0 px-1 text-neutral-500 hover:text-ae-danger lg:opacity-0 lg:group-hover:opacity-100"
                }
              >
                {armedDeleteId === id ? "Delete?" : "🗑"}
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
