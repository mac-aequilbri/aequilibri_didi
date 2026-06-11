import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { escalateHighRisks } from "../actions";

export const dynamic = "force-dynamic";

export default async function RiskEscalationPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const open = await prisma.platConRisk.findMany({
    where: { orgId: ctx.orgId, status: "open", escalatedAt: null },
  });
  const buckets = [12, 15, 20].map((t) => ({
    threshold: t,
    count: open.filter((r) => r.likelihood * r.impact >= t).length,
  }));

  return (
    <div className="p-6 max-w-xl">
      <PageHeader
        title="Risk escalation"
        subtitle="Batch-escalate open risks whose likelihood × impact meets a threshold."
      />
      <form action={escalateHighRisks} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <label className="block text-sm">
          <span className="text-neutral-600">Score threshold</span>
          <select name="threshold" defaultValue="12" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
            {buckets.map((b) => (
              <option key={b.threshold} value={b.threshold}>
                ≥ {b.threshold} — {b.count} open risk{b.count === 1 ? "" : "s"} affected
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Escalation note</span>
          <input name="note" placeholder="Escalated to director review" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <button type="submit" className="btn-ae">
          Escalate matching risks
        </button>
      </form>
    </div>
  );
}
