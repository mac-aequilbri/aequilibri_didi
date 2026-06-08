"use client";

import { useRef, useEffect } from "react";
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex gap-4">
      {/* Left chat panel */}
      <div className="flex-1 ae-card flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="font-semibold">Didi — Dulong Downs AI</span>
            <span className="ml-2 text-xs text-neutral-400 font-mono">{sessionKey}</span>
          </div>
          <form action={resetSession}>
            <input type="hidden" name="dummy" value="1" />
            <button type="submit" className="btn-ae-outline text-xs py-1 px-2">
              New Session
            </button>
          </form>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 max-h-[500px] overflow-auto flex flex-col gap-2 mb-4"
        >
          {messages.map((msg) => {
            if (msg.role === "system") return null;

            const isUser = msg.role === "user";

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-[var(--ae-space)]/10 rounded p-3 max-w-[80%] ml-auto text-sm">
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
                  className={`rounded p-3 max-w-[80%] text-sm whitespace-pre-wrap ${
                    isProposal && !isConfirmed
                      ? "border border-amber-400 bg-yellow-50"
                      : "bg-neutral-50"
                  }`}
                >
                  {isProposal && !isConfirmed && (
                    <div className="flex items-center gap-2 mb-2">
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
          })}
        </div>

        {/* Input area */}
        <div className="border-t pt-3">
          <form
            ref={formRef}
            action={async (fd) => {
              await sendMessage(fd);
              formRef.current?.reset();
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              name="message"
              rows={3}
              placeholder="Ask Didi..."
              required
              className="w-full border rounded p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--ae-space)]"
            />
            <input type="hidden" name="sessionKey" value={sessionKey} />
            <div className="flex justify-end">
              <SendButton />
            </div>
          </form>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-60 shrink-0 flex flex-col gap-4">
        {/* Active Rules */}
        <div className="ae-card">
          <div className="font-semibold text-sm mb-2">Active Rules</div>
          {activeRules.length === 0 ? (
            <p className="text-xs text-neutral-400">No active rules.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activeRules.map((rule) => (
                <li key={rule.ruleCode}>
                  <div className="flex items-start gap-1">
                    {rule.cannotOverride && (
                      <span className="text-red-500 text-xs mt-0.5">⚠</span>
                    )}
                    <div>
                      <span className="font-mono text-xs">{rule.ruleCode}</span>
                      <p className="text-xs text-neutral-600">{rule.description}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Overdue Actions */}
        <div className="ae-card">
          <div className="font-semibold text-sm mb-2">Overdue Actions</div>
          {overdueItems.length === 0 ? (
            <p className="text-xs text-neutral-400">None overdue.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {overdueItems.map((item) => (
                <li key={item.id}>
                  <p className="text-xs">
                    {item.action.length > 60
                      ? item.action.slice(0, 60) + "…"
                      : item.action}
                  </p>
                  <p className="text-xs text-neutral-500">{item.owner}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
