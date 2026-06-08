import Link from "next/link";
import { prisma } from "@/lib/db";
import { currency, formatDate } from "@/lib/format";
import { incGst } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function ConditionReports() {
  let rows: { id: number; reportNumber: string; clientName: string; grade: string; urgency: string; status: string; price: number; generatedAt: Date }[] = [];
  let total = 0;
  try {
    const reports = await prisma.uc1RoofConditionReport.findMany({ orderBy: { generatedAt: "desc" } });
    rows = reports.map((r) => {
      const price = incGst(Number(r.priceExGst));
      total += price;
      return { id: r.id, reportNumber: r.reportNumber, clientName: r.clientName, grade: r.conditionGrade, urgency: r.urgencyLevel, status: r.status, price, generatedAt: r.generatedAt };
    });
  } catch {
    rows = [];
  }

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
