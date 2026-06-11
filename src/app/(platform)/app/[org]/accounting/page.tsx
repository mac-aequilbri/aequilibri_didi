// Accounting integration — demo stub behind a provider interface. Real
// Xero/MYOB OAuth slots in later (tokens must be encrypted at rest first).

import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function AccountingPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const connections = await prisma.platConAccountingConnection.findMany({
    where: { orgId: ctx.orgId },
  });

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title="Accounting"
        subtitle="Stage-2 'write when invited' integration — demo connection shown; real Xero/MYOB OAuth is wired behind the same interface."
      />
      {connections.map((c) => (
        <section key={c.id} className="ae-card p-5 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold capitalize">{c.provider} — {c.orgName || ctx.orgName}</h2>
              <p className="text-xs text-neutral-500">
                {c.lastSync ? `Last sync ${formatDate(c.lastSync)} · ${c.recordsSynced} records` : "Never synced"}
              </p>
              {c.syncLog && <p className="text-xs text-neutral-500 mt-1">{c.syncLog}</p>}
            </div>
            <StatusBadge status={c.status} />
          </div>
        </section>
      ))}
      {connections.length === 0 && (
        <div className="ae-card p-8 text-center text-sm text-neutral-500">
          No accounting connection configured for this organisation.
        </div>
      )}
    </div>
  );
}
