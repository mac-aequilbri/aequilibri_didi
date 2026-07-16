// Agent authorization dashboard (governance §8 — Agent-to-Data Authorization).
// Renders the live allowlist from the agent registry + TOOL_POLICY (the same
// single source the executor enforces), so what's shown is what's enforced:
// each agent's tools, target tables, risk class, and who resolves its
// proposals. The one management control is the org's AI write-authority level.
// Admin-gated.

import { PageHeader } from "@/components/PageHeader";
import { requireAdmin, requireOrgCtx } from "@/lib/platform/org-context";
import { canApprove } from "@/lib/platform/roles";
import { SPECIALISTS } from "@/services/platform/agents/registry";
import { setAiAuthorityAction } from "./actions";

export const dynamic = "force-dynamic";

const AUTHORITY: { value: string; label: string; hint: string }[] = [
  { value: "propose_only", label: "Propose only", hint: "every AI write queues for approval" },
  { value: "approve_required", label: "Approve required", hint: "every AI write queues for approval" },
  { value: "auto_low_risk", label: "Auto low-risk", hint: "low-risk writes execute; high-risk queue" },
];

/** Who can resolve a proposal for this table — derived from the same §2.2
 *  Approve matrix the approvals actions enforce. */
function approverLabel(table: string | undefined): string {
  if (!table) return "—";
  if (canApprove("builder", table)) return "Owner / Manager";
  if (canApprove("builder+finance", table)) return "Owner / Finance Manager";
  return "Administrator";
}

function RiskBadge({ risk }: { risk: string }) {
  const cls =
    risk === "read"
      ? "bg-neutral-100 text-neutral-600"
      : risk === "low_write"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{risk}</span>;
}

export default async function AgentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgCtx(org);
  await requireAdmin(ctx);
  const status = typeof sp.status === "string" ? sp.status : "";

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader
        title="AI agents & authorization"
        subtitle="What each agent may read, propose, and who resolves it (governance §8)."
      />

      {status === "saved" && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          AI write-authority updated.
        </div>
      )}

      <section className="ae-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-1">AI write authority</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Applies to every agent. Writes always land through the PENDING_WRITES queue and the
          canonical-vocabulary guard — this sets whether low-risk writes may execute without a
          human approval.
        </p>
        <form action={setAiAuthorityAction} className="flex items-end gap-3">
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <label className="text-xs text-neutral-600">
            Level
            <select
              name="aiAuthority"
              defaultValue={ctx.aiAuthority}
              className="mt-1 block rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {AUTHORITY.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label} — {a.hint}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Save
          </button>
        </form>
      </section>

      {SPECIALISTS.map((agent) => {
        const tools = Object.entries(agent.toolPolicy);
        return (
          <section key={agent.key} className="ae-card p-5 mb-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">
                {agent.label} <span className="font-normal text-neutral-400">· Module {agent.module}</span>
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mb-3">{agent.description}</p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-2">Tool</th>
                  <th className="py-1 pr-2">Table · op</th>
                  <th className="py-1 pr-2 text-center">Risk</th>
                  <th className="py-1 text-right">Resolved by</th>
                </tr>
              </thead>
              <tbody>
                {tools.map(([name, p]) => (
                  <tr key={name} className="border-t border-neutral-100">
                    <td className="py-1.5 pr-2 font-mono text-xs">{name}</td>
                    <td className="py-1.5 pr-2 font-mono text-xs">
                      {"table" in p && p.table ? `${p.table} · ${p.op}` : p.kind === "service" ? "(service)" : "(read)"}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <RiskBadge risk={p.risk} />
                    </td>
                    <td className="py-1.5 text-right text-xs text-neutral-600">
                      {p.risk === "read" ? "no queue — reads aren't proposals" : approverLabel("table" in p ? p.table : undefined)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      <p className="text-xs text-neutral-400">
        An agent's reach is defined by what it may propose into PENDING_WRITES — this page renders
        the same registry the executor enforces, so it cannot drift from reality. Per-agent
        overrides beyond the authority level require a code change to TOOL_POLICY by design.
      </p>
    </div>
  );
}
