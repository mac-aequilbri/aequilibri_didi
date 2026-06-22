import Link from "next/link";
import { currency, formatDate } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { loadUc1ConditionReports, type Uc1ConditionReportView } from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

export default async function ConditionReports() {
  let rows: Uc1ConditionReportView[] = [];
  try {
    rows = await loadUc1ConditionReports();
  } catch {
    rows = [];
  }
  const total = rows.reduce((s, r) => s + r.price, 0);

  return (
    <div>
      <PageHeader title="Condition Reports" subtitle={`${rows.length} reports · ${currency(total)} total`} />
      <div className="px-8">
        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>Report</th><th>Client</th><th>Grade</th><th>Urgency</th><th>Status</th><th className="text-right">Price inc GST</th><th>Generated</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-neutral-500">No condition reports.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold"><Link href={`/uc1/condition-reports/${r.id}`} className="text-blue-600 hover:underline">{r.reportNumber}</Link></td><td>{r.clientName || "—"}</td>
                    <td>{r.grade}</td><td>{r.urgency}</td><td><StatusBadge status={r.status} /></td>
                    <td className="text-right">{currency(r.price)}</td><td>{formatDate(r.generatedAt)}</td>
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
