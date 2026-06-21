import { notFound } from "next/navigation";
import Link from "next/link";
import { currency, formatDate } from "@/lib/format";
import { incGst } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { loadUc1ConditionReport } from "@/lib/platform/uc1Source";
import { finaliseReport, deliverReport, updateReportPrice } from "../actions";

export const dynamic = "force-dynamic";

const GRADE_COLOR: Record<string, string> = {
  A: "#27ae60", B: "#2ecc71", C: "#f39c12", D: "#e67e22", F: "#e74c3c",
};

export default async function ConditionReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadUc1ConditionReport(id);
  if (!report) notFound();

  return (
    <div className="pb-16">
      <PageHeader
        title={report.reportNumber}
        subtitle={report.quote?.propertyAddress}
        actions={[
          { href: `/uc1/condition-reports/${report.id}/print`, label: "Print" },
          { href: "/uc1/condition-reports", label: "Back", variant: "outline" },
        ]}
      />

      <div className="px-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="ae-card p-6">
            <div className="flex items-center gap-4">
              <div
                className="flex items-center justify-center w-16 h-16 rounded-lg text-white text-3xl font-bold"
                style={{ background: GRADE_COLOR[report.conditionGrade] ?? "#888" }}
              >
                {report.conditionGrade}
              </div>
              <div>
                <div className="text-sm text-neutral-500">Condition Score</div>
                <div className="text-2xl font-bold">{report.conditionScore}/100</div>
                <div className="text-sm text-neutral-500">
                  {report.lifeRemainingYears} yrs remaining · {report.urgencyLevel.replace(/_/g, " ")}
                </div>
              </div>
            </div>
          </div>

          <div className="ae-card p-6">
            <h3 className="font-semibold mb-2">AI Assessment</h3>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{report.aiAssessment || "—"}</p>
          </div>

          <div className="ae-card p-6">
            <h3 className="font-semibold mb-2">Recommended Works</h3>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{report.recommendedWorks || "—"}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="ae-card p-5">
            <h3 className="font-semibold mb-3">Details</h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-neutral-500">Status</dt><dd><StatusBadge status={report.status} /></dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Type</dt><dd>{report.reportType}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Client</dt><dd>{report.clientName || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Inspector</dt><dd>{report.inspectorName || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Price inc GST</dt><dd>{currency(incGst(Number(report.priceExGst)))}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Quote</dt><dd>{report.quote ? <Link href={`/uc1/quotes/${report.quote.id}`} className="text-blue-600 hover:underline">{report.quote.refNumber}</Link> : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Generated</dt><dd>{formatDate(report.generatedAt)}</dd></div>
            </dl>
          </div>

          <div className="ae-card p-5 space-y-3">
            <h3 className="font-semibold">Actions</h3>
            <div className="flex gap-2">
              {report.status === "draft" && (
                <form action={finaliseReport}>
                  <input type="hidden" name="id" value={report.id} />
                  <button type="submit" className="btn-ae text-xs">Finalise</button>
                </form>
              )}
              {report.status !== "delivered" && (
                <form action={deliverReport}>
                  <input type="hidden" name="id" value={report.id} />
                  <button type="submit" className="btn-ae-outline text-xs">Mark Delivered</button>
                </form>
              )}
            </div>
            <form action={updateReportPrice} className="flex items-center gap-2 pt-2">
              <input type="hidden" name="id" value={report.id} />
              <input type="number" name="price_ex_gst" defaultValue={Number(report.priceExGst)} step="0.01" className="ae-input text-sm w-28" />
              <button type="submit" className="btn-ae-outline text-xs">Update Price</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
