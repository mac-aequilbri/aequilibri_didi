import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { materialDisplay } from "@/services/uc1/constants";
import { createConditionReport } from "../../../condition-reports/actions";

export const dynamic = "force-dynamic";

const REPORT_TYPES: [string, string][] = [
  ["homebuyer", "Pre-Purchase Inspection"],
  ["insurance", "Insurance Assessment"],
  ["maintenance", "Routine Maintenance Report"],
  ["strata", "Strata / Body Corporate"],
];

export default async function ConditionReportCreate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const quote = await prisma.uc1Quote
    .findUnique({ where: { id: quoteId }, include: { contact: true, lidarAnalysis: true } })
    .catch(() => null);
  if (!quote) notFound();

  return (
    <div className="pb-16">
      <PageHeader
        title="Generate Condition Report"
        subtitle={`${quote.refNumber} · ${quote.propertyAddress}`}
        actions={[{ href: `/uc1/quotes/${quoteId}`, label: "Back to Quote", variant: "outline" }]}
      />

      <div className="px-8">
        <div className="ae-card p-6 max-w-2xl">
          {!quote.lidarAnalysis && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
              No LiDAR data on this quote — the AI assessment will rely on roof material/pitch only.
              Run the Roof Inspector first for a richer report.
            </p>
          )}
          <form action={createConditionReport} className="space-y-5">
            <input type="hidden" name="quote_id" value={quoteId} />

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Report Type</label>
              <select name="report_type" className="ae-input w-full">
                {REPORT_TYPES.map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Client Name</label>
                <input type="text" name="client_name" defaultValue={quote.contact?.name ?? ""} className="ae-input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Client Email</label>
                <input type="email" name="client_email" defaultValue={quote.contact?.email ?? ""} className="ae-input w-full" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Client Company</label>
                <input type="text" name="client_company" className="ae-input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Inspector Name</label>
                <input type="text" name="inspector_name" className="ae-input w-full" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Price ex GST</label>
              <input type="number" name="price_ex_gst" defaultValue={350} step="0.01" className="ae-input w-40" />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Inspector Notes (fed to AI)</label>
              <textarea name="inspector_notes" rows={3} placeholder="Observations to factor into the assessment…" className="ae-input w-full" />
            </div>

            <p className="text-xs text-neutral-500">
              Roof: {materialDisplay(quote.material)} · pitch {quote.pitchType} · {Number(quote.flatAreaSqm)} m²
            </p>

            <button type="submit" className="btn-ae">Generate Report with AI</button>
          </form>
        </div>
      </div>
    </div>
  );
}
