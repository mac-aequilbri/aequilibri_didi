// Accounting — Stage-1 "read first" integration. Real Xero (Custom
// Connection) when XERO_CLIENT_ID/SECRET are configured; demo ledger
// otherwise. Read-only: nothing is ever written back to the ledger.

import { prisma } from "@/lib/db";
import { MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate } from "@/lib/format";
import { xeroEnabled, type AccountingSummary } from "@/lib/platform/accounting";
import { requireOrgCtx } from "@/lib/platform/org-context";
import {
  connectAccountingAction,
  disconnectAccountingAction,
  syncAccountingAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountingPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const { error } = await searchParams;
  const connection = await prisma.platConAccountingConnection.findFirst({
    where: { orgId: ctx.orgId },
  });

  let summary: AccountingSummary | null = null;
  if (connection?.syncLog) {
    try {
      summary = JSON.parse(connection.syncLog);
    } catch {
      summary = null;
    }
  }
  const live = xeroEnabled();
  const connected = connection?.status === "connected";

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Accounting"
        subtitle={
          live
            ? "Xero Custom Connection configured — reads are live. Nothing is written back to the ledger."
            : "No Xero credentials configured — the demo ledger stands in. Set XERO_CLIENT_ID/SECRET to go live."
        }
      />
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <section className="ae-card p-5 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold capitalize">
              {connection ? `${connection.provider} — ${connection.orgName || "…"}` : "Not connected"}
            </h2>
            <p className="text-xs text-neutral-500">
              {connection?.lastSync
                ? `Last sync ${formatDate(connection.lastSync)} · ${connection.recordsSynced} records`
                : "Never synced"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connection && <StatusBadge status={connection.status} />}
            {!connected ? (
              <form action={connectAccountingAction}>
                <input type="hidden" name="org" value={ctx.orgSlug} />
                <button type="submit" className="btn-ae">
                  Connect {live ? "Xero" : "demo ledger"}
                </button>
              </form>
            ) : (
              <>
                <form action={syncAccountingAction}>
                  <input type="hidden" name="org" value={ctx.orgSlug} />
                  <button type="submit" className="btn-ae">
                    Sync now
                  </button>
                </form>
                <form action={disconnectAccountingAction}>
                  <input type="hidden" name="org" value={ctx.orgSlug} />
                  <button type="submit" className="btn-ae-outline">
                    Disconnect
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <MetricCard value={summary.invoices.count} label="Invoices (latest page)" />
            <MetricCard value={currency(summary.invoices.outstanding)} label="Invoices outstanding" />
            <MetricCard value={summary.bills.count} label="Bills" />
            <MetricCard value={currency(summary.bills.outstanding)} label="Bills outstanding" />
          </div>
          <section className="ae-card p-5">
            <h2 className="font-semibold text-sm mb-3">
              Recent invoices{summary.demoMode ? " (demo data)" : ""}
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-2">Number</th>
                  <th className="py-1 pr-2">Contact</th>
                  <th className="py-1 pr-2 text-right">Total</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.sample.map((row, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="py-2 pr-2 font-mono text-xs">{row.number}</td>
                    <td className="py-2 pr-2">{row.contact}</td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(row.total)}</td>
                    <td className="py-2 text-xs">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
