import { notFound } from "next/navigation";
import { currency, formatDate } from "@/lib/format";
import { incGst } from "@/lib/money";
import { loadUc1ConditionReport } from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

const GRADE_COLOR: Record<string, string> = {
  A: "#27ae60", B: "#2ecc71", C: "#f39c12", D: "#e67e22", F: "#e74c3c",
};

export default async function ConditionReportPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadUc1ConditionReport(id);
  if (!report) notFound();

  return (
    <main className="max-w-3xl mx-auto bg-white p-10 my-8 text-sm" style={{ color: "#2c2c2c" }}>
      <div className="flex justify-between items-start border-b pb-4 mb-6" style={{ borderColor: "#bbb2ab" }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#dc9f82" }}>æquilibri Roofing</h1>
          <p className="text-neutral-500">Roof Condition Report</p>
        </div>
        <div className="text-right">
          <div className="font-bold text-lg">{report.reportNumber}</div>
          <div className="text-neutral-500">{report.status.toUpperCase()}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div><div className="text-neutral-500 uppercase text-xs">Property</div><div>{report.quote?.propertyAddress ?? "—"}</div></div>
        <div><div className="text-neutral-500 uppercase text-xs">Client</div><div>{report.clientName || "—"}</div></div>
        <div><div className="text-neutral-500 uppercase text-xs">Inspector</div><div>{report.inspectorName || "—"}</div></div>
        <div><div className="text-neutral-500 uppercase text-xs">Generated</div><div>{formatDate(report.generatedAt)}</div></div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div
          className="flex items-center justify-center w-16 h-16 rounded-lg text-white text-3xl font-bold"
          style={{ background: GRADE_COLOR[report.conditionGrade] ?? "#888" }}
        >
          {report.conditionGrade}
        </div>
        <div>
          <div>Condition Score: <strong>{report.conditionScore}/100</strong></div>
          <div>Life remaining: <strong>{report.lifeRemainingYears} years</strong></div>
          <div>Urgency: <strong>{report.urgencyLevel.replace(/_/g, " ")}</strong></div>
        </div>
      </div>

      <h2 className="font-bold mb-1">Assessment</h2>
      <p className="whitespace-pre-wrap mb-5">{report.aiAssessment || "—"}</p>

      <h2 className="font-bold mb-1">Recommended Works</h2>
      <p className="whitespace-pre-wrap mb-6">{report.recommendedWorks || "—"}</p>

      <div className="text-right border-t pt-3" style={{ borderColor: "#e3ddcd" }}>
        <div className="text-lg font-bold">Report fee (inc GST): {currency(incGst(Number(report.priceExGst)))}</div>
      </div>

      <p className="text-xs text-neutral-400 mt-10">Use your browser&apos;s Print function (Ctrl/Cmd+P) to produce a PDF.</p>
    </main>
  );
}
