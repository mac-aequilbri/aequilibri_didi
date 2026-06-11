"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendChatMessage, approveMessage, rejectMessage } from "../actions";

// Submit button reflecting the in-flight server action.
function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn-ae px-5 py-2 self-end disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

// Animated three-dot "thinking" indicator shown while the assistant replies.
function ThinkingBubble() {
  return (
    <div className="flex flex-col max-w-[75%] gap-1 self-start items-start">
      <span className="text-xs text-gray-400 px-1">Assistant</span>
      <div className="rounded-2xl px-4 py-3 bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="sr-only">Assistant is thinking…</span>
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
}

// Render assistant content as GitHub-flavoured markdown. Without this the model's
// **bold**, tables, and numbered lists show up as raw text.
function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1.5 mt-1">{children}</h3>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-600 italic mb-2">
              {children}
            </blockquote>
          ),
          code: ({ className, children }) =>
            className?.includes("language-") ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="bg-gray-100 rounded px-1 py-0.5 text-[0.85em] font-mono">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="bg-gray-900 text-gray-100 rounded-md p-3 overflow-x-auto text-xs mb-2 font-mono">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 px-2 py-1 align-top">{children}</td>
          ),
          hr: () => <hr className="my-2 border-gray-200" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface Message {
  id: number;
  role: string;
  content: string;
  requiresApproval: boolean;
  approved: boolean;
  createdAt: Date;
  projectId: number | null;
}

interface Project {
  id: number;
  name: string;
}

interface ChatClientProps {
  messages: Message[];
  projects: Project[];
  selectedProjectId: number | null;
  tenantId: number;
}

export default function ChatClient({
  messages,
  projects,
  selectedProjectId,
  tenantId,
}: ChatClientProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Optimistic echo of the in-flight message + thinking indicator, cleared once
  // the server revalidates and the real messages arrive.
  const [pendingText, setPendingText] = useState<string | null>(null);

  useEffect(() => {
    setPendingText(null);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingText]);

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    router.push(`/uc3/ai-chat${val ? `?project=${val}` : ""}`);
  }

  return (
    <div className="ae-card flex flex-col gap-4">
      {/* Project selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Project context:
        </label>
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedProjectId ?? ""}
          onChange={handleProjectChange}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-3 h-[600px] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4"
      >
        {messages.length === 0 && !pendingText && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No messages yet. Start the conversation below.
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const needsApproval = msg.requiresApproval && !msg.approved;

          return (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[75%] gap-1 ${isUser ? "self-end items-end" : "self-start items-start"}`}
            >
              <span className="text-xs text-gray-400 px-1">
                {isUser ? "You" : "Assistant"}
              </span>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm break-words ${
                  isUser
                    ? "bg-blue-600 text-white whitespace-pre-wrap"
                    : needsApproval
                    ? "bg-white text-gray-800 border-2 border-yellow-400 shadow-sm"
                    : "bg-white text-gray-800 border border-gray-200 shadow-sm"
                }`}
              >
                {needsApproval && (
                  <div className="flex items-center gap-1 mb-1.5 text-yellow-700 text-xs font-semibold">
                    <span>Requires approval</span>
                  </div>
                )}
                {isUser ? msg.content : <MarkdownMessage content={msg.content} />}
                {msg.approved && (
                  <div className="mt-1 text-xs text-green-600 font-medium">Approved</div>
                )}
              </div>

              {/* Approve / Reject buttons */}
              {needsApproval && (
                <div className="flex gap-2 mt-1">
                  <form action={approveMessage}>
                    <input type="hidden" name="id" value={msg.id} />
                    <input type="hidden" name="projectId" value={selectedProjectId ?? ""} />
                    <button type="submit" className="btn-ae text-xs px-3 py-1">
                      Approve
                    </button>
                  </form>
                  <form action={rejectMessage}>
                    <input type="hidden" name="id" value={msg.id} />
                    <input type="hidden" name="projectId" value={selectedProjectId ?? ""} />
                    <button type="submit" className="btn-ae-outline text-xs px-3 py-1">
                      Reject
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}

        {/* Optimistic echo of the in-flight message + thinking indicator */}
        {pendingText && (
          <>
            <div className="flex flex-col max-w-[75%] gap-1 self-end items-end">
              <span className="text-xs text-gray-400 px-1">You</span>
              <div className="rounded-2xl px-4 py-2.5 text-sm break-words bg-blue-600 text-white whitespace-pre-wrap opacity-70">
                {pendingText}
              </div>
            </div>
            <ThinkingBubble />
          </>
        )}
      </div>

      {/* Input form */}
      <form
        ref={formRef}
        action={async (fd) => {
          const text = (fd.get("content") as string | null)?.trim() ?? "";
          if (!text) return;
          setPendingText(text);
          formRef.current?.reset();
          await sendChatMessage(fd);
        }}
        className="flex gap-3 items-end"
      >
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="projectId" value={selectedProjectId ?? ""} />
        <textarea
          name="content"
          rows={3}
          placeholder="Ask a question about your projects..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
        />
        <SendButton />
      </form>
    </div>
  );
}
