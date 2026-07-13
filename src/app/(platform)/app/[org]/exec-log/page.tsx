// Execution log — the audit trail AND the AI-write approval queue.
// Pending proposals can be approved (the deferred write executes) or rejected.

import { FilterBar } from "@/components/FilterBar";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import {
  parseListQuery,
  sortAndPaginate,
  toClientConfig,
  type ListViewConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadExecLogHistory, type LogView } from "@/lib/platform/execLogSource";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { orgPath } from "@/lib/platform/paths";
import { approveProposalAction, rejectProposalAction } from "./actions";

export const dynamic = "force-dynamic";

// Sort + pager config for the history table (the pending queue stays unpaged —
// approvals must always all be visible). Filters can be added here later.
const execLogListConfig: ListViewConfig<LogView> = {
  fields: [],
  sort: [
    { name: "created", label: "Date", getValue: (l) => l.createdAt },
    { name: "operation", label: "Operation", getValue: (l) => l.operation.toLowerCase() },
    { name: "table", label: "Table", getValue: (l) => l.targetTable.toLowerCase() },
    { name: "status", label: "Status", getValue: (l) => l.status.toLowerCase() },
  ],
  pageSize: 50,
};

function Payload({ raw }: { raw: string }) {
  let pretty = raw;
  try {
    pretty = JSON.stringify(JSON.parse(raw));
  } catch {
    /* keep raw */
  }
  return (
    <code className="text-xs text-neutral-500 break-all line-clamp-2">{pretty.slice(0, 240)}</code>
  );
}

export default async function ExecLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, execLogListConfig);

  const [pending, allLogs] = await Promise.all([loadPendingWrites(ctx), loadExecLogHistory(ctx)]);
  const proposals = pending.filter((p) => p.status === "proposed");
  const { items: logs, page, pageCount } = sortAndPaginate(allLogs, query, execLogListConfig);

  const tableLabel = (t: string) => t.replace(/^plat_(core|con|cfg)_/, "");

  return (
    <div className="p-6">
      <PageHeader
        title="Activity"
        subtitle="Every write is audited here — a full, append-only trail of who changed what, and when."
      />

      {proposals.length > 0 && (
        <section className="ae-card p-5 mb-6 border-amber-300">
          <h2 className="font-semibold mb-3">Pending approval ({proposals.length})</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-2">Proposal</th>
                <th className="py-1 pr-2">Payload</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2 whitespace-nowrap">
                    <span className="font-medium">
                      {p.op} {p.tableKey.replace(/_/g, " ")}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      #{p.id} · {p.actorName || p.actorType} · expires{" "}
                      {p.expiresAt.toISOString().slice(0, 10)}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <Payload raw={p.payload} />
                  </td>
                  <td className="py-2 whitespace-nowrap text-right">
                    <form action={approveProposalAction} className="inline">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="proposalId" value={p.id} />
                      <button className="btn-ae text-xs" type="submit">
                        Approve
                      </button>
                    </form>{" "}
                    <form action={rejectProposalAction} className="inline">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="proposalId" value={p.id} />
                      <button className="btn-ae-outline text-xs" type="submit">
                        Reject
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/exec-log")}
        config={toClientConfig(execLogListConfig)}
        query={query}
        shown={allLogs.length}
        total={allLogs.length}
        page={page}
        pageCount={pageCount}
      >
      <section className="ae-card p-5">
        <h2 className="font-semibold mb-3">History</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Operation</th>
              <th className="py-1 pr-2">Actor</th>
              <th className="py-1 pr-2">Payload</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1">When</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-neutral-100 align-top">
                <td className="py-2 pr-2 whitespace-nowrap font-medium">
                  {log.operation} {tableLabel(log.targetTable)}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs text-neutral-500">
                  {log.actorType}
                  {log.actorName ? ` · ${log.actorName}` : ""}
                  {log.approvedBy ? ` · approved by ${log.approvedBy}` : ""}
                </td>
                <td className="py-2 pr-2">
                  <Payload raw={log.payload} />
                  {log.error && <span className="block text-xs text-red-600">{log.error}</span>}
                </td>
                <td className="py-2 pr-2">
                  <StatusBadge status={log.status} />
                </td>
                <td className="py-2 whitespace-nowrap text-xs text-neutral-500">
                  {log.createdAt ? log.createdAt.toISOString().slice(0, 16).replace("T", " ") : "—"}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td className="py-4 text-sm text-neutral-500" colSpan={5}>
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      </FilterBar>
    </div>
  );
}
