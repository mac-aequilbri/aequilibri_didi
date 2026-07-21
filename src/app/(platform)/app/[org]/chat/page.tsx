// Standalone Chat — the conversational assistant surfaced as its own feature,
// independent of the project-delivery ("UC3") module bundle. Same engine,
// persona and approve-executes-write path as /assistant; it just runs on a
// separate "standalone" session thread and isn't pinned to a project/job.
// Gated by the `chat` feature flag and, like every platform route, by
// requireOrgCtx — so it's only reachable for an onboarded org's members.

import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { getOrCreateSession, listMessages } from "@/services/platform/assistant/chat";
import AssistantClient, { ChatMessageView } from "../assistant/AssistantClient";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  if (!ctx.config.features.chat) redirect(orgPath(ctx.orgSlug, ""));

  const currentViewer = await getCurrentViewer(ctx);
  const sessionId = await getOrCreateSession(ctx, undefined, "standalone");
  const [rows, pending] = await Promise.all([listMessages(ctx, sessionId), loadPendingWrites(ctx)]);
  const proposals = pending.filter((p) => p.status === "proposed").slice(0, 10);

  // General starter prompts — this is a free-form chat, not a project screen, so
  // they don't lean on a pinned job the way the /assistant suggestions do.
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

  return (
    <div className="p-6">
      <PageHeader
        title={ctx.config.assistant.name}
        subtitle={`Chat — ${authorityLabel}; ${roleLabel}.`}
      />
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
      />
    </div>
  );
}
