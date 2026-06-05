import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function ExecLog() {
  let rows: { id: number; toolName: string; status: string; durationMs: number; createdAt: Date }[] = [];
  try {
    rows = await prisma.uc1ExecutionLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, toolName: true, status: true, durationMs: true, createdAt: true } });
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
