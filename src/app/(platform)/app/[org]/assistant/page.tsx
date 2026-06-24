// Conversational Assistant — one screen for every org; persona, approval
// policy and rule injection come from org configuration.

import { PageHeader } from "@/components/PageHeader";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { getActiveRules } from "@/services/platform/learning";
import { loadJobsList } from "@/lib/platform/jobsListSource";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { getOrCreateSession, listMessages } from "@/services/platform/assistant/chat";
import AssistantClient, { ChatMessageView } from "./AssistantClient";

export const dynamic = "force-dynamic";

export default async function AssistantPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const currentViewer = await getCurrentViewer(ctx);
  const sessionId = await getOrCreateSession(ctx);
  const [rows, rules, pending, jobs] = await Promise.all([
    listMessages(ctx, sessionId),
    getActiveRules(ctx),
    loadPendingWrites(ctx),
    loadJobsList(ctx),
  ]);
  const proposals = pending.filter((p) => p.status === "proposed").slice(0, 10);
  const topJob = jobs[0];

  // Starter prompts, grounded in this org's features and live data, to lower
  // the blank-canvas barrier on the assistant's headline screen.
  const f = ctx.config.features;
  const suggestions = [
    "What needs my attention right now?",
    ...(f.risks ? ["Summarise the open risks and flag any I should escalate."] : []),
    ...(topJob ? [`Draft this week's progress update for ${topJob.name}.`] : []),
    "Which budget lines are tracking over?",
  ].slice(0, 4);

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
    <div className="p-6 grid gap-6 lg:grid-cols-[1fr_240px]">
      <div>
        <PageHeader
          title={ctx.config.assistant.name}
          subtitle={`In-context assistant — ${authorityLabel}; ${roleLabel}.`}
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
          defaultJobId={topJob?.id}
        />
      </div>
      <aside className="hidden lg:block pt-16">
        <div className="ae-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
            Active rules ({rules.length})
          </h2>
          <ul className="space-y-2">
            {rules.slice(0, 8).map((r) => (
              <li key={r.id} className="text-xs text-neutral-600">
                <span className="font-mono text-[0.65rem] text-neutral-400">{r.ruleCode}</span>{" "}
                {r.description.slice(0, 90)}
              </li>
            ))}
            {rules.length === 0 && <li className="text-xs text-neutral-400">None yet.</li>}
          </ul>
        </div>
      </aside>
    </div>
  );
}
