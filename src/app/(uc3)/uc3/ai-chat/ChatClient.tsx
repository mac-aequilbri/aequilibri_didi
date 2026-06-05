"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendChatMessage, approveMessage, rejectMessage } from "../actions";

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        {messages.length === 0 && (
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
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  isUser
                    ? "bg-blue-600 text-white"
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
                {msg.content}
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
      </div>

      {/* Input form */}
      <form action={sendChatMessage} className="flex gap-3 items-end">
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
        <button type="submit" className="btn-ae px-5 py-2 self-end">
          Send
        </button>
      </form>
    </div>
  );
}
