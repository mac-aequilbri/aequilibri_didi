"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { friendlyTableLabel } from "@/lib/platform/tableLabels";
import {
  approveFromChatAction,
  closeSessionReviewAction,
  rejectFromChatAction,
  saveConversationNoteFromChatAction,
  sendMessageAction,
} from "./actions";

/** Human phrasing for the assistant's tool chips — users should read what the
 *  assistant did, not internal tool identifiers like "query_records". */
const TOOL_LABELS: Record<string, string> = {
  query_records: "Looked up records",
  capture_source_note: "Saved a note",
  create_action: "Created an action",
  update_action: "Updated an action",
  save_decision: "Saved a decision",
  propose_rule: "Proposed a learning rule",
  update_budget_line: "Updated a budget line",
  create_variation_draft: "Drafted a variation",
  create_risk: "Logged a risk",
  log_workstream_update: "Updated a workstream",
  generate_weekly_report: "Generated a weekly report",
  run_construction_intake: "Ran document intake",
  suggest_ingestion_routes: "Suggested filing routes",
  onboarding_status: "Checked onboarding status",
};

/** Delegation markers ("→ Finance") are already human-readable; unknown tool
 *  names fall back to humanised snake_case. */
function toolLabel(tool: string): string {
  if (TOOL_LABELS[tool]) return TOOL_LABELS[tool];
  if (tool.startsWith("→")) return tool;
  const words = tool.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ChatMessageView {
  id: number | string;
  role: string;
  content: string;
  toolCalls: { tool: string; ok: boolean; status?: string; proposalId?: number | string }[];
}

export interface PendingProposalView {
  id: number | string;
  operation: string;
  targetTable: string;
  payload: string;
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Send message"
      className="btn-ae shrink-0 rounded-full px-5 disabled:opacity-50"
    >
      {pending ? "…" : "Send"}
    </button>
  );
}

/** Close-session submit — shows in-flight state while the multi-step review
 *  (save note → capture correction → run hypothesis engine → end session)
 *  runs, so the click clearly registers instead of appearing to do nothing. */
function CloseSessionButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ae disabled:opacity-60">
      {pending ? "Saving review & closing…" : "Close session & start fresh"}
    </button>
  );
}

/** A single pending AI write with Approve/Reject controls. Clicking either
 *  kicks off a backend round-trip (write → revalidate) that used to give no
 *  feedback at all. Now the whole row locks and the pressed button shows a
 *  spinner while it runs, and — critically — a failed write surfaces its error
 *  inline instead of silently vanishing as if it had succeeded. */
function ProposalRow({
  orgSlug,
  proposal,
  tableLabel,
}: {
  orgSlug: string;
  proposal: PendingProposalView;
  tableLabel: (t: string) => string;
}) {
  const [approveState, approveAction, approving] = useActionState(approveFromChatAction, null);
  const [rejectState, rejectAction, rejecting] = useActionState(rejectFromChatAction, null);
  const busy = approving || rejecting;
  const error = approveState?.error ?? rejectState?.error;

  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <span className="flex-1 truncate">
          <span className="font-medium">
            {proposal.operation} {tableLabel(proposal.targetTable)}
          </span>{" "}
          <code className="text-neutral-500">{proposal.payload.slice(0, 90)}</code>
        </span>
        <form action={approveAction}>
          <input type="hidden" name="org" value={orgSlug} />
          <input type="hidden" name="proposalId" value={proposal.id} />
          <button
            className="btn-ae text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
            type="submit"
            disabled={busy}
          >
            {approving && (
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin"
              />
            )}
            {approving ? "Applying…" : "Approve"}
          </button>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="org" value={orgSlug} />
          <input type="hidden" name="proposalId" value={proposal.id} />
          <button
            className="btn-ae-outline text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
            type="submit"
            disabled={busy}
          >
            {rejecting && (
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border-2 border-neutral-300 border-t-neutral-600 animate-spin"
              />
            )}
            {rejecting ? "Rejecting…" : "Reject"}
          </button>
        </form>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 rounded border border-red-200 bg-red-50 px-2 py-1 text-[0.7rem] text-red-700">
          Couldn&apos;t apply this change — {error}
        </p>
      )}
    </div>
  );
}

/** Circular avatar so each turn is clearly attributed — a strong "this is a chat" cue. */
function Avatar({ label, kind }: { label: string; kind: "assistant" | "user" }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold ${
        kind === "assistant" ? "bg-ae-space text-white" : "bg-neutral-200 text-neutral-600"
      }`}
    >
      {label}
    </span>
  );
}

function ThinkingBubble({ avatar }: { avatar: string }) {
  // Long waits (multi-tool turns) used to look frozen — after ~5s the bubble
  // starts counting elapsed seconds so the user can tell it's still alive.
  // The interval lives and dies with the bubble: it mounts when a message goes
  // in-flight and unmounts on completion or failure, so no external cleanup.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex justify-start gap-2.5">
      <Avatar label={avatar} kind="assistant" />
      <div className="rounded-2xl rounded-bl-sm px-3.5 py-3 bg-white border border-neutral-200 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="sr-only">Assistant is thinking…</span>
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" />
          {elapsed >= 5 && (
            <span className="ml-1.5 text-[0.7rem] text-neutral-400">Still working… {elapsed}s</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Collapse repeated identical tool calls ("query_records ×4") so the trace reads
 *  as a quiet activity note, not a row of clickable-looking chips. */
function summariseToolCalls(calls: ChatMessageView["toolCalls"]) {
  const out: { tool: string; status?: string; ok: boolean; count: number }[] = [];
  for (const c of calls) {
    const last = out[out.length - 1];
    if (last && last.tool === c.tool && last.status === c.status && last.ok === c.ok) {
      last.count += 1;
    } else {
      out.push({ tool: c.tool, status: c.status, ok: c.ok, count: 1 });
    }
  }
  return out;
}

export default function AssistantClient({
  orgSlug,
  assistantName,
  sessionId,
  messages,
  pendingProposals,
  suggestions = [],
  defaultJobId,
}: {
  orgSlug: string;
  assistantName: string;
  sessionId: number | string;
  defaultJobId?: number | string;
  messages: ChatMessageView[];
  pendingProposals: PendingProposalView[];
  /** Data-grounded starter prompts shown in the empty state. */
  suggestions?: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reviewDetailsRef = useRef<HTMLDetailsElement>(null);
  const reviewFormRef = useRef<HTMLFormElement>(null);
  const [inFlight, setInFlight] = useState<string | null>(null);
  /** Text of the last message that failed to send — drives the inline error bar
   *  and its Retry button. Cleared when the next send starts. */
  const [sendError, setSendError] = useState<string | null>(null);
  const [closedNotice, setClosedNotice] = useState(false);

  // Clear the optimistic in-flight bubble once the server round-trip brings
  // new messages. Done during render (not an effect) per React's "adjust state
  // when a prop changes" guidance.
  const [seenCount, setSeenCount] = useState(messages.length);
  if (messages.length !== seenCount) {
    setSeenCount(messages.length);
    setInFlight(null);
  }

  // A new sessionId means the close-session review just completed: getOrCreateSession
  // handed us a fresh session (the old one is stamped ended). Confirm it explicitly
  // — otherwise the thread just silently empties. Adjust-state-during-render per
  // React guidance; the initial mount doesn't trip it (prev seeded to sessionId).
  const [prevSession, setPrevSession] = useState(sessionId);
  if (sessionId !== prevSession) {
    setPrevSession(sessionId);
    setClosedNotice(true);
    setInFlight(null);
  }

  // Scrolling to the newest message is a real DOM side-effect, so it stays here.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // On a fresh session, collapse and clear the review panel so it's ready for
  // next time, and auto-dismiss the confirmation after a few seconds.
  useEffect(() => {
    reviewDetailsRef.current?.removeAttribute("open");
    reviewFormRef.current?.reset();
  }, [sessionId]);
  useEffect(() => {
    if (!closedNotice) return;
    const t = setTimeout(() => setClosedNotice(false), 6000);
    return () => clearTimeout(t);
  }, [closedNotice]);

  // The composer is a textarea that grows with its content (1–~6 rows). Height
  // is data-driven (scrollHeight), so it must be re-measured on input, after
  // reset, and after restoring failed text.
  const resizeComposer = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`; // cap ≈ 6 rows
  };

  // Drop a starter prompt into the composer and send it straight away.
  const sendSuggestion = (text: string) => {
    if (!inputRef.current || !formRef.current) return;
    inputRef.current.value = text;
    setInFlight(text);
    formRef.current.requestSubmit();
  };

  const tableLabel = friendlyTableLabel;
  const avatarLabel = assistantName.trim()[0]?.toUpperCase() ?? "A";

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      {closedNotice && (
        <div
          role="status"
          className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          Session saved and reviewed — started a fresh conversation.
          <button
            type="button"
            onClick={() => setClosedNotice(false)}
            aria-label="Dismiss"
            className="ml-auto text-emerald-600 hover:text-emerald-800"
          >
            ×
          </button>
        </div>
      )}
      {/* Chat window: a bordered surface with a titled header + tinted thread so
          it reads unmistakably as a conversation, not a content panel. */}
      <div className="flex-1 min-h-0 flex flex-col ae-card overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-neutral-100 px-4 py-2.5">
          <Avatar label={avatarLabel} kind="assistant" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{assistantName}</p>
            <p className="text-[0.7rem] text-neutral-400">Chat assistant</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-[0.7rem] text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Online
          </span>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 bg-neutral-50 px-4 py-4">
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
          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser && <Avatar label={avatarLabel} kind="assistant" />}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                    isUser
                      ? "bg-ae-space text-white rounded-br-sm"
                      : "bg-white border border-neutral-200 rounded-bl-sm"
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
                    <div className="mt-2 pt-2 border-t border-neutral-100 flex flex-wrap items-center gap-1 text-neutral-400">
                      <span className="text-[0.65rem]">used</span>
                      {summariseToolCalls(m.toolCalls).map((t, i) => (
                        <span
                          key={i}
                          className={`text-[0.65rem] px-1.5 py-0.5 rounded ${
                            t.status === "delegated"
                              ? "text-indigo-700 bg-indigo-50"
                              : t.status === "proposed"
                                ? "text-amber-700 bg-amber-50"
                                : t.ok
                                  ? "text-emerald-700 bg-emerald-50"
                                  : "text-red-700 bg-red-50"
                          }`}
                        >
                          {toolLabel(t.tool)}
                          {t.count > 1 ? ` ×${t.count}` : ""}
                          {t.status === "proposed" ? " · pending" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {isUser && <Avatar label="Y" kind="user" />}
              </div>
            );
          })}
          {inFlight && (
            <div className="flex justify-end gap-2.5">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm shadow-sm bg-ae-space text-white opacity-70">
                <p className="whitespace-pre-wrap">{inFlight}</p>
              </div>
              <Avatar label="Y" kind="user" />
            </div>
          )}
          {inFlight && <ThinkingBubble avatar={avatarLabel} />}
        </div>
      </div>

      {pendingProposals.length > 0 && (
        <div className="mt-3 border border-amber-200 bg-amber-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">
            {assistantName} proposed {pendingProposals.length} change
            {pendingProposals.length === 1 ? "" : "s"} awaiting your approval:
          </p>
          <div className="space-y-2">
            {pendingProposals.map((prop) => (
              <ProposalRow key={prop.id} orgSlug={orgSlug} proposal={prop} tableLabel={tableLabel} />
            ))}
          </div>
        </div>
      )}

      {sendError !== null && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <span className="flex-1">Message failed to send — nothing was lost.</span>
          <button
            type="button"
            onClick={() => sendSuggestion(sendError)}
            className="btn-ae-outline shrink-0 text-xs"
          >
            Retry
          </button>
        </div>
      )}
      <form
        ref={formRef}
        action={async (formData: FormData) => {
          const text = String(formData.get("message") ?? "").trim();
          if (!text) return;
          setSendError(null);
          setInFlight(text);
          formRef.current?.reset();
          resizeComposer();
          try {
            await sendMessageAction(formData);
          } catch {
            // The action threw (network drop, server error) — without this the
            // thinking bubble would spin forever and the typed message be gone.
            setInFlight(null);
            setSendError(text);
            // Put the text back in the composer, unless the user already
            // started typing something new while the send was in flight.
            if (inputRef.current && !inputRef.current.value) {
              inputRef.current.value = text;
              resizeComposer();
            }
          }
        }}
        className="mt-3 flex items-center gap-2 rounded-3xl border border-neutral-300 bg-white py-1.5 pl-4 pr-1.5 shadow-sm focus-within:border-ae-space focus-within:ring-2 focus-within:ring-[var(--ae-space,#1f2937)]"
      >
        <input type="hidden" name="org" value={orgSlug} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <textarea
          ref={inputRef}
          name="message"
          rows={1}
          autoComplete="off"
          placeholder={`Message ${assistantName}…`}
          onInput={resizeComposer}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter makes a newline. Skip while an IME
            // composition is in progress so CJK input doesn't send early.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="max-h-36 flex-1 resize-none self-center overflow-y-auto bg-transparent text-sm focus:outline-none"
        />
        <SendButton />
      </form>
      <p className="mt-1.5 text-center text-[0.7rem] text-neutral-400">
        AI can make mistakes — verify important figures.
      </p>
      <details ref={reviewDetailsRef} className="mt-2 ae-card p-4">
        <summary className="cursor-pointer text-sm font-medium">End session with review</summary>
        <form ref={reviewFormRef} action={closeSessionReviewAction} className="mt-3 space-y-3">
          <input type="hidden" name="org" value={orgSlug} />
          <input type="hidden" name="sessionId" value={sessionId} />
          {defaultJobId != null && <input type="hidden" name="jobId" value={defaultJobId} />}
          <label className="block text-xs text-neutral-600">
            Session close summary
            <textarea
              name="reviewSummary"
              rows={3}
              required
              placeholder="What happened in this session, and what should be remembered for next time?"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-neutral-600">
            Correction capture
            <select
              name="correctionStatus"
              defaultValue="none"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="none">No correction to capture</option>
              <option value="captured">Capture one correction</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="dimension"
              defaultValue="assistant.session"
              placeholder="Correction dimension"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="rootCause"
              placeholder="Root cause (required if capturing correction)"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <textarea
              name="aiOutput"
              rows={3}
              placeholder="AI output that was wrong"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <textarea
              name="humanCorrection"
              rows={3}
              placeholder="Human correction applied"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <CloseSessionButton />
        </form>
      </details>
      <details className="mt-3 ae-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Capture a source note</summary>
        <form action={saveConversationNoteFromChatAction} className="mt-3 space-y-3">
          <input type="hidden" name="org" value={orgSlug} />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input
            name="title"
            placeholder="Optional note title"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <textarea
            name="note"
            rows={4}
            placeholder="Paste the source note, call summary, or important context to preserve as a document."
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="btn-ae">Save note to documents</button>
        </form>
      </details>
    </div>
  );
}
