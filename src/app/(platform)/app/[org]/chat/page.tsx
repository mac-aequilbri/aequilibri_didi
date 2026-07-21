// Standalone Chat — the conversational assistant surfaced as its own feature,
// independent of the project-delivery ("UC3") module bundle. Same engine,
// persona and approve-executes-write path as /assistant, but a multi-conversation
// product: a history sidebar, a "New chat" button and auto-titled threads, none
// pinned to a project/job. Gated by the `chat` feature flag and, like every
// platform route, by requireOrgCtx — reachable only for an onboarded org's members.

import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { recordIdParam } from "@/lib/platform/recordWriter";
import {
  listChatSessions,
  listMessages,
  resolveChatSession,
} from "@/services/platform/assistant/chat";
import AssistantClient, { ChatMessageView } from "../assistant/AssistantClient";
import { newChatAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  if (!ctx.config.features.chat) redirect(orgPath(ctx.orgSlug, ""));

  const currentViewer = await getCurrentViewer(ctx);
  const requested = recordIdParam((await searchParams).s ?? null) ?? undefined;
  // Resolve the target conversation first (may open a fresh one), then list —
  // so the list includes a just-created thread and marks it active.
  const sessionId = await resolveChatSession(ctx, requested);
  const [sessions, rows, pending] = await Promise.all([
    listChatSessions(ctx),
    listMessages(ctx, sessionId),
    loadPendingWrites(ctx),
  ]);
  const proposals = pending.filter((p) => p.status === "proposed").slice(0, 10);

  // General starter prompts — free-form chat, not a project screen, so they
  // don't lean on a pinned job the way the /assistant suggestions do.
  const suggestions = [
    "What can you help me with?",
    "Give me a quick status across everything.",
    "Draft a message I can send to the team.",
    "Summarise anything that needs my attention.",
  ];

  const messages: ChatMessageView[] = rows.map((m) => {
    let toolCalls: ChatMessageView["toolCalls"] = [];
    try {
      toolCalls = JSON.parse(m.toolCalls);
    } catch {
      /* legacy/blank */
    }
    return { id: m.id, role: m.role, content: m.content, toolCalls };
  });

  const authorityLabel =
    ctx.aiAuthority === "auto_low_risk"
      ? "low-risk writes apply immediately; the rest need approval"
      : "every write needs your approval";
  const roleLabel = currentViewer.role === "broker" ? "read-only conversational mode" : "write-enabled mode";
  const chatPath = orgPath(ctx.orgSlug, "/chat");

  return (
    <div className="p-6 grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="order-last lg:order-first">
        <form action={newChatAction}>
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <button type="submit" className="btn-ae w-full">+ New chat</button>
        </form>
        <h2 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Conversations
        </h2>
        <ul className="space-y-1">
          {sessions.map((s) => {
            const active = String(s.id) === String(sessionId);
            return (
              <li key={s.id}>
                <Link
                  href={`${chatPath}?s=${s.id}`}
                  className={`block truncate rounded px-2.5 py-1.5 text-sm ${
                    active
                      ? "bg-neutral-100 font-medium text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {s.title}
                </Link>
              </li>
            );
          })}
          {sessions.length === 0 && (
            <li className="px-2.5 text-xs text-neutral-400">No conversations yet.</li>
          )}
        </ul>
      </aside>
      <div>
        <PageHeader title={ctx.config.assistant.name} subtitle={`Chat — ${authorityLabel}; ${roleLabel}.`} />
        <AssistantClient
          orgSlug={ctx.orgSlug}
          assistantName={ctx.config.assistant.name}
          sessionId={sessionId}
          messages={messages}
          pendingProposals={proposals.map((p) => ({
            id: p.id,
            operation: p.op,
            targetTable: p.tableKey,
            payload: p.payload,
          }))}
          suggestions={suggestions}
          basePath="/chat"
          showSessionReview={false}
        />
      </div>
    </div>
  );
}
