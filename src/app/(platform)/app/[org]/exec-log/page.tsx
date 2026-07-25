// Execution log — the audit trail AND the AI-write approval queue.
// Pending proposals can be approved (the deferred write executes) or rejected.

import { FilterBar } from "@/components/FilterBar";
import { SortableTh } from "@/components/SortableTh";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/form/ConfirmSubmitButton";
import { SubmitButton } from "@/components/form/SubmitButton";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  toClientConfig,
  type ListViewConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadExecLogHistory, type LogView } from "@/lib/platform/execLogSource";
import { loadPendingWrites } from "@/lib/platform/pendingWritesSource";
import { orgPath } from "@/lib/platform/paths";
import { friendlyTableLabel } from "@/lib/platform/tableLabels";
import { approveProposalAction, rejectProposalAction } from "./actions";

export const dynamic = "force-dynamic";

// Search + sort + pager config for the history table (the pending queue stays
// unpaged — approvals must always all be visible). Status/operation values vary
// by backend, so narrowing is free-text search rather than fixed enum filters.
const execLogListConfig: ListViewConfig<LogView> = {
  search: [
    (l) => l.operation,
    (l) => l.targetTable,
    (l) => l.actorType,
    (l) => l.actorName,
    (l) => l.approvedBy,
    (l) => l.status,
    (l) => l.payload,
  ],
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
  let summary = "raw payload";
  try {
    const parsed = JSON.parse(raw);
    pretty = JSON.stringify(parsed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const count = Object.keys(parsed).length;
      summary = `${count} field${count === 1 ? "" : "s"}`;
    }
  } catch {
    /* keep raw */
  }
  return (
    <details className="text-xs text-neutral-500">
      <summary className="cursor-pointer select-none">{summary}</summary>
      <code className="break-all">{pretty}</code>
    </details>
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
  const sp = await searchParams;
  const query = parseListQuery(sp, execLogListConfig);

  const [pending, allLogs] = await Promise.all([loadPendingWrites(ctx), loadExecLogHistory(ctx)]);
  const proposals = pending.filter((p) => p.status === "proposed");
  const filtered = hasActiveFilters(query);
  const { items: logs, total, matching, page, pageCount } = applyListQuery(allLogs, query, execLogListConfig);

  const tableLabel = friendlyTableLabel;

  return (
    <div className="p-6">
      <PageHeader
        title="Activity"
        subtitle="Every write is audited here — a full, append-only trail of who changed what, and when."
      />

      {sp.error === "approve_failed" && (
        <div role="alert" className="ae-card p-3 mb-4 border-ae-danger/30 text-sm text-ae-danger">
          The approved write could not be executed — no change was made. The proposal is marked
          failed in the trail below.
        </div>
      )}

      {proposals.length > 0 && (
        <section className="ae-card p-5 mb-6 border-ae-warning/30">
          <h2 className="font-semibold mb-3">Pending approval ({proposals.length})</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th scope="col" className="py-1 pr-2">Proposal</th>
                <th scope="col" className="py-1 pr-2">Payload</th>
                <th scope="col" className="py-1" />
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2 whitespace-nowrap">
                    <span className="font-medium">
                      {p.op} {tableLabel(p.tableKey)}
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
                      <ConfirmSubmitButton
                        label="Approve"
                        confirmLabel="Confirm — executes the write"
                        pendingLabel="Approving…"
                        className="btn-ae text-xs"
                      />
                    </form>{" "}
                    <form action={rejectProposalAction} className="inline">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="proposalId" value={p.id} />
                      <SubmitButton label="Reject" pendingLabel="Rejecting…" className="btn-ae-outline text-xs" />
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
        shown={matching}
        total={total}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search activity…"
      >
      <section className="ae-card p-5">
        <h2 className="font-semibold mb-3">History</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <SortableTh name="operation">Operation</SortableTh>
              <th scope="col" className="py-1 pr-2">Actor</th>
              <th scope="col" className="py-1 pr-2">Payload</th>
              <SortableTh name="status">Status</SortableTh>
              <SortableTh name="created" className="py-1">When</SortableTh>
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
                  {log.error && <span className="block text-xs text-ae-danger">{log.error}</span>}
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
                <td colSpan={5} className="py-6">
                  <EmptyState
                    title={filtered ? "No activity matches this search" : "No activity yet"}
                    hint={
                      filtered
                        ? "Try a broader search term, or clear it above."
                        : "Every create, update, and approval is recorded here as it happens."
                    }
                  />
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
