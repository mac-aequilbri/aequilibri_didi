"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  approveFromChatAction,
  rejectFromChatAction,
  resetSessionAction,
  sendMessageAction,
} from "./actions";

export interface ChatMessageView {
  id: number;
  role: string;
  content: string;
  toolCalls: { tool: string; ok: boolean; status?: string; proposalId?: number }[];
}

export interface PendingProposalView {
  id: number;
  operation: string;
  targetTable: string;
  payload: string;
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ae disabled:opacity-50">
      {pending ? "Thinking…" : "Send"}
    </button>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm px-3.5 py-3 bg-white border border-neutral-100 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="sr-only">Assistant is thinking…</span>
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
}

export default function AssistantClient({
  orgSlug,
  assistantName,
  sessionId,
  messages,
  pendingProposals,
  suggestions = [],
}: {
  orgSlug: string;
  assistantName: string;
  sessionId: number;
  messages: ChatMessageView[];
  pendingProposals: PendingProposalView[];
  /** Data-grounded starter prompts shown in the empty state. */
  suggestions?: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inFlight, setInFlight] = useState<string | null>(null);

  // Clear the optimistic in-flight bubble once the server round-trip brings
  // new messages. Done during render (not an effect) per React's "adjust state
  // when a prop changes" guidance.
  const [seenCount, setSeenCount] = useState(messages.length);
  if (messages.length !== seenCount) {
    setSeenCount(messages.length);
    setInFlight(null);
  }

  // Scrolling to the newest message is a real DOM side-effect, so it stays here.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // Drop a starter prompt into the composer and send it straight away.
  const sendSuggestion = (text: string) => {
    if (!inputRef.current || !formRef.current) return;
    inputRef.current.value = text;
    setInFlight(text);
    formRef.current.requestSubmit();
  };

  const tableLabel = (t: string) => t.replace(/^plat_(core|con|cfg)_/, "");

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && !inFlight && (
          <div className="py-6 text-center">
            <p className="text-sm text-neutral-500">
              Start a conversation — {assistantName} knows this organisation&apos;s jobs, budget,
              actions and learning rules, and can save decisions and actions for you.
            </p>
            {suggestions.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2 justify-center">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendSuggestion(s)}
                    className="suggestion-chip"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                m.role === "user"
                  ? "bg-[var(--ae-space,#1f2937)] text-white rounded-br-sm"
                  : "bg-white border border-neutral-100 rounded-bl-sm"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
              {m.toolCalls.length > 0 && (
                <div className="mt-2 pt-2 border-t border-neutral-100 flex flex-wrap gap-1">
                  {m.toolCalls.map((t, i) => (
                    <span
                      key={i}
                      className={`text-[0.65rem] px-1.5 py-0.5 rounded-full border ${
                        t.status === "proposed"
                          ? "border-amber-300 text-amber-700 bg-amber-50"
                          : t.ok
                            ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                            : "border-red-300 text-red-700 bg-red-50"
                      }`}
                    >
                      {t.tool}
                      {t.status === "proposed" ? " · pending" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {inFlight && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm shadow-sm bg-[var(--ae-space,#1f2937)] text-white opacity-70">
              <p className="whitespace-pre-wrap">{inFlight}</p>
            </div>
          </div>
        )}
        {inFlight && <ThinkingBubble />}
      </div>

      {pendingProposals.length > 0 && (
        <div className="mt-3 border border-amber-200 bg-amber-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">
            {assistantName} proposed {pendingProposals.length} change
            {pendingProposals.length === 1 ? "" : "s"} awaiting your approval:
          </p>
          <div className="space-y-2">
            {pendingProposals.map((prop) => (
              <div key={prop.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">
                  <span className="font-medium">
                    {prop.operation} {tableLabel(prop.targetTable)}
                  </span>{" "}
                  <code className="text-neutral-500">{prop.payload.slice(0, 90)}</code>
                </span>
                <form action={approveFromChatAction}>
                  <input type="hidden" name="org" value={orgSlug} />
                  <input type="hidden" name="proposalId" value={prop.id} />
                  <button className="btn-ae text-xs" type="submit">
                    Approve
                  </button>
                </form>
                <form action={rejectFromChatAction}>
                  <input type="hidden" name="org" value={orgSlug} />
                  <input type="hidden" name="proposalId" value={prop.id} />
                  <button className="btn-ae-outline text-xs" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        ref={formRef}
        action={async (formData: FormData) => {
          const text = String(formData.get("message") ?? "").trim();
          if (!text) return;
          setInFlight(text);
          formRef.current?.reset();
          await sendMessageAction(formData);
        }}
        className="mt-3 flex gap-2"
      >
        <input type="hidden" name="org" value={orgSlug} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input
          ref={inputRef}
          name="message"
          autoComplete="off"
          placeholder={`Ask ${assistantName}…`}
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ae-space,#1f2937)]"
        />
        <SendButton />
      </form>
      <form action={resetSessionAction} className="mt-2 text-right">
        <input type="hidden" name="org" value={orgSlug} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <button type="submit" className="text-xs text-neutral-400 hover:text-neutral-600">
          End session &amp; start fresh
        </button>
      </form>
    </div>
  );
}
