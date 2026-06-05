import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import {
  connectAccounting,
  syncAccounting,
  disconnectAccounting,
} from "../actions";

export const dynamic = "force-dynamic";

type Provider = "xero" | "myob" | "qbo";

type Connection = {
  id: number;
  provider: string;
  status: string;
  orgName: string | null;
  lastSync: Date | null;
  syncLog: string | null;
  recordsSynced: number;
};

const PROVIDERS: {
  key: Provider;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    key: "xero",
    label: "Xero",
    description: "Cloud-based accounting for small to medium businesses.",
    color: "text-sky-600",
  },
  {
    key: "myob",
    label: "MYOB",
    description: "Australian-born accounting and payroll software.",
    color: "text-purple-600",
  },
  {
    key: "qbo",
    label: "QuickBooks Online",
    description: "Intuit's cloud accounting platform.",
    color: "text-emerald-600",
  },
];

export default async function Uc3AccountingPage() {
  const cookieStore = await cookies();
  const tenantIdRaw = cookieStore.get("uc3_tenant_id")?.value;
  let tenantId: number | null = tenantIdRaw ? Number(tenantIdRaw) : null;

  let connections: Connection[] = [];
  try {
    if (!tenantId) {
      const fallback = await prisma.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }
    if (tenantId) {
      connections = (await prisma.uc3AccountingConnection.findMany({
        where: { tenantId },
        orderBy: { provider: "asc" },
      })) as unknown as Connection[];
    }
  } catch {
    connections = [];
  }

  const byProvider = new Map<string, Connection>(
    connections.map((c) => [c.provider, c])
  );

  const connectedCount = connections.filter(
    (c) => c.status === "connected"
  ).length;
  const errorCount = connections.filter((c) => c.status === "error").length;
  const totalSynced = connections.reduce((s, c) => s + c.recordsSynced, 0);

  return (
    <div className="pb-16">
      <PageHeader
        title="Accounting Integrations"
        subtitle="Connect your accounting platform to sync budgets and cashflow"
      />

      <div className="px-8 space-y-6">
        {/* Summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={String(connectedCount)} label="Connected" />
          <MetricCard
            value={
              <span className={errorCount > 0 ? "text-red-600" : undefined}>
                {errorCount}
              </span>
            }
            label="Errors"
          />
          <MetricCard value={String(totalSynced)} label="Records Synced" />
          <MetricCard value={`${connectedCount} / 3`} label="Platforms" />
        </div>

        {/* Provider cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PROVIDERS.map(({ key, label, description, color }) => {
            const conn = byProvider.get(key);
            const isConnected = conn?.status === "connected";
            const isError = conn?.status === "error";

            let statusLabel: string;
            if (isConnected) statusLabel = "Connected";
            else if (isError) statusLabel = "Error";
            else statusLabel = "Disconnected";

            return (
              <div key={key} className="ae-card p-6 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className={`text-lg font-semibold ${color}`}>{label}</h2>
                    <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
                  </div>
                  <StatusBadge status={statusLabel} />
                </div>

                {/* Connection info */}
                {conn && (
                  <div className="text-sm space-y-1 border-t border-neutral-200 dark:border-neutral-700 pt-3">
                    {conn.orgName && (
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Organisation</span>
                        <span className="font-medium truncate max-w-[160px]">{conn.orgName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Last sync</span>
                      <span>
                        {conn.lastSync ? formatDate(conn.lastSync) : <span className="text-neutral-400">Never</span>}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Records synced</span>
                      <span className="tabular-nums">{conn.recordsSynced.toLocaleString()}</span>
                    </div>
                    {conn.syncLog && (
                      <p className="text-xs text-neutral-400 pt-1 italic truncate" title={conn.syncLog}>
                        {conn.syncLog}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-auto pt-2">
                  {!isConnected ? (
                    <form action={connectAccounting}>
                      <input type="hidden" name="provider" value={key} />
                      <button type="submit" className="btn-ae text-sm">
                        Connect
                      </button>
                    </form>
                  ) : (
                    <>
                      <form action={syncAccounting}>
                        <input type="hidden" name="provider" value={key} />
                        <button type="submit" className="btn-ae text-sm">
                          Sync Now
                        </button>
                      </form>
                      <form action={disconnectAccounting}>
                        <input type="hidden" name="provider" value={key} />
                        <button
                          type="submit"
                          className="btn-ae-outline text-sm text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          Disconnect
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-neutral-400 pb-4">
          Connections are scoped to this tenant. Token storage is for demo purposes only.
        </p>
      </div>
    </div>
  );
}
