"use client";

import { useRef, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { confirmProposal, rejectProposal, sendMessage, resetSession } from "../actions";

// Submit button with a pending state. Without this, the Send action (a slow
// Claude call) gives no feedback and looks broken / invites double-submits.
function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ae" disabled={pending} aria-busy={pending}>
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

// Animated three-dot "thinking" indicator shown while Didi composes a reply.
function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm px-3.5 py-3 bg-white border border-neutral-100 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="sr-only">Didi is thinking…</span>
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
}

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  hasProposal: boolean;
  proposalConfirmed: boolean;
  createdAt: Date | string;
}

interface ActiveRule {
  ruleCode: string;
  description: string;
  cannotOverride: boolean;
}

interface OverdueItem {
  id: number;
  action: string;
  owner: string;
}

interface ChatClientProps {
  messages: Message[];
  activeRules: ActiveRule[];
  overdueItems: OverdueItem[];
  sessionKey: string;
}

export default function ChatClient({
  messages,
  activeRules,
  overdueItems,
  sessionKey,
}: ChatClientProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Optimistic in-flight user message. While Didi is composing a reply the
  // server hasn't revalidated yet, so we echo the user's text and a thinking
  // indicator. Cleared once new messages arrive from the server.
  const [pendingText, setPendingText] = useState<string | null>(null);

  useEffect(() => {
    setPendingText(null);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingText]);

  const visibleMessages = messages.filter((m) => m.role !== "system");
  const isEmpty = visibleMessages.length === 0 && !pendingText;

  return (
    <div className="flex gap-4 items-start">
      {/* Left chat panel */}
      <div className="flex-1 ae-card flex flex-col h-[600px] overflow-hidden p-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-[var(--ae-space)] text-white font-semibold text-sm">
              D
            </span>
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate">Didi — Dulong Downs AI</div>
              <div className="text-xs text-neutral-400 font-mono truncate">{sessionKey}</div>
            </div>
          </div>
          <form action={resetSession} className="shrink-0">
            <input type="hidden" name="dummy" value="1" />
            <button type="submit" className="btn-ae-outline text-xs py-1 px-2">
              New Session
            </button>
          </form>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto flex flex-col gap-3 px-4 py-4 bg-neutral-50/40"
        >
          {isEmpty ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-neutral-400 gap-2">
              <span className="grid place-items-center w-12 h-12 rounded-full bg-[var(--ae-space)]/10 text-[var(--ae-space)] text-xl">
                D
              </span>
              <p className="text-sm font-medium text-neutral-500">Start chatting with Didi</p>
              <p className="text-xs max-w-[260px]">
                Ask about cashflows, invoices, decisions, or anything on Dulong Downs.
              </p>
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const isUser = msg.role === "user";

              if (isUser) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="bg-[var(--ae-space)] text-white rounded-2xl rounded-br-sm px-3.5 py-2 max-w-[80%] text-sm whitespace-pre-wrap shadow-sm">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // assistant
              const isProposal = msg.hasProposal;
              const isConfirmed = msg.proposalConfirmed;

              return (
                <div key={msg.id} className="flex justify-start">
                  <div
                    className={`rounded-2xl rounded-bl-sm px-3.5 py-2 max-w-[80%] text-sm whitespace-pre-wrap shadow-sm ${
                      isProposal && !isConfirmed
                        ? "border border-amber-400 bg-amber-50"
                        : "bg-white border border-neutral-100"
                    }`}
                  >
                    {isProposal && !isConfirmed && (
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-amber-600 font-medium text-xs">
                          ⚠ Write proposal — confirm?
                        </span>
                        <form action={confirmProposal} className="inline">
                          <input type="hidden" name="msgId" value={msg.id} />
                          <button type="submit" className="btn-ae text-xs py-0.5 px-2">
                            Confirm
                          </button>
                        </form>
                        <form action={rejectProposal} className="inline">
                          <input type="hidden" name="msgId" value={msg.id} />
                          <button type="submit" className="btn-ae-outline text-xs py-0.5 px-2">
                            Reject
                          </button>
                        </form>
                      </div>
                    )}
                    {isProposal && isConfirmed && (
                      <div className="text-green-600 text-xs mb-1">✓ Confirmed</div>
                    )}
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}

          {/* Optimistic echo of the in-flight message + thinking indicator */}
          {pendingText && (
            <>
              <div className="flex justify-end">
                <div className="bg-[var(--ae-space)] text-white rounded-2xl rounded-br-sm px-3.5 py-2 max-w-[80%] text-sm whitespace-pre-wrap shadow-sm opacity-70">
                  {pendingText}
                </div>
              </div>
              <ThinkingBubble />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-neutral-100 px-4 py-3 bg-white">
          <form
            ref={formRef}
            action={async (fd) => {
              const text = (fd.get("message") as string | null)?.trim() ?? "";
              if (!text) return;
              setPendingText(text);
              formRef.current?.reset();
              await sendMessage(fd);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              name="message"
              rows={2}
              placeholder="Ask Didi..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              required
              className="flex-1 border border-neutral-200 rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--ae-space)] focus:border-[var(--ae-space)]"
            />
            <input type="hidden" name="sessionKey" value={sessionKey} />
            <SendButton />
          </form>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-64 shrink-0 flex flex-col gap-4">
        {/* Active Rules */}
        <div className="ae-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">Active Rules</span>
            {activeRules.length > 0 && (
              <span className="text-xs font-medium text-[var(--ae-space)] bg-[var(--ae-space)]/10 rounded-full px-2 py-0.5">
                {activeRules.length}
              </span>
            )}
          </div>
          {activeRules.length === 0 ? (
            <p className="text-xs text-neutral-400">No active rules.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {activeRules.map((rule) => (
                <li
                  key={rule.ruleCode}
                  className={`rounded-md border px-2.5 py-2 ${
                    rule.cannotOverride
                      ? "border-red-200 bg-red-50/60"
                      : "border-neutral-100 bg-neutral-50/60"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-mono text-[11px] font-semibold text-neutral-700">
                      {rule.ruleCode}
                    </span>
                    {rule.cannotOverride && (
                      <span className="text-[10px] font-medium text-red-600 bg-red-100 rounded px-1.5 py-0.5 leading-none">
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 leading-snug">{rule.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Overdue Actions */}
        <div className="ae-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">Overdue Actions</span>
            {overdueItems.length > 0 && (
              <span className="text-xs font-medium text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                {overdueItems.length}
              </span>
            )}
          </div>
          {overdueItems.length === 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <span className="text-green-500">✓</span>
              None overdue.
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {overdueItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border-l-2 border-red-400 bg-red-50/60 pl-2.5 pr-2 py-1.5"
                >
                  <p className="text-xs text-neutral-700 leading-snug">
                    {item.action.length > 60
                      ? item.action.slice(0, 60) + "…"
                      : item.action}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">{item.owner}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
