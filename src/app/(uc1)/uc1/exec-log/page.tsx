import { formatDate } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { loadUc1ExecLog, type Uc1ExecLogView } from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

export default async function ExecLog() {
  let rows: Uc1ExecLogView[] = [];
  try {
    rows = await loadUc1ExecLog();
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Last 100 tool executions" />
      <div className="px-8">
        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>Tool</th><th>Status</th><th className="text-right">Duration</th><th>When</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-neutral-500">No log entries.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-sm">{r.toolName}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-right">{r.durationMs} ms</td>
                    <td>{formatDate(r.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
