import { currency, formatDate } from "@/lib/format";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import {
  loadUc1PriceCheck,
  type Uc1PriceCheckLogView,
  type Uc1PriceMovementView,
} from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

export default async function PriceCheckLogPage() {
  let logs: Uc1PriceCheckLogView[] = [];
  let recentChanges: Uc1PriceMovementView[] = [];
  try {
    ({ logs, recentChanges } = await loadUc1PriceCheck());
  } catch {
    // graceful empty state
  }

  const latest = logs[0] ?? null;

  return (
    <div className="pb-16">
      <PageHeader
        title="Price Check Log"
        subtitle="Vendor price-scan history and recent movements"
        actions={[{ href: "/uc1/purchase-orders", label: "Purchase Orders", variant: "outline" }]}
      />

      <div className="px-8 space-y-6">
        {latest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard value={latest.vendorsChecked} label="Vendors (last run)" />
            <MetricCard value={latest.pricesUpdated} label="Prices Updated" />
            <MetricCard value={latest.pricesUnchanged} label="Unchanged" />
            <MetricCard value={latest.errors} label="Errors" />
          </div>
        )}

        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]"><h6 className="font-bold">Scan Runs</h6></div>
          <table className="ae-table">
            <thead>
              <tr><th>Run</th><th>Status</th><th className="text-right">Checked</th><th className="text-right">Updated</th><th className="text-right">Errors</th><th>Summary</th></tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No price-check runs recorded.</td></tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDate(l.runAt)}</td>
                    <td><StatusBadge status={l.status === "success" ? "complete" : l.status === "error" ? "cancelled" : "pending"} /></td>
                    <td className="text-right">{l.vendorsChecked}</td>
                    <td className="text-right">{l.pricesUpdated}</td>
                    <td className="text-right">{l.errors}</td>
                    <td className="max-w-md truncate">{l.summary || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]"><h6 className="font-bold">Recent Price Movements</h6></div>
          <table className="ae-table">
            <thead>
              <tr><th>Vendor</th><th>Item</th><th className="text-right">Previous</th><th className="text-right">Current</th><th className="text-right">Δ</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {recentChanges.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No tracked price changes.</td></tr>
              ) : (
                recentChanges.map((c) => {
                  const prev = Number(c.previousPrice ?? 0);
                  const cur = Number(c.unitPriceExGst);
                  const delta = cur - prev;
                  return (
                    <tr key={c.id}>
                      <td className="font-medium">{c.vendor.name}</td>
                      <td>{c.description}</td>
                      <td className="text-right">{currency(prev)}</td>
                      <td className="text-right">{currency(cur)}</td>
                      <td className={`text-right ${delta > 0 ? "text-red-600" : delta < 0 ? "text-green-600" : ""}`}>
                        {delta > 0 ? "+" : ""}{currency(delta)}
                      </td>
                      <td>{formatDate(c.updatedAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
