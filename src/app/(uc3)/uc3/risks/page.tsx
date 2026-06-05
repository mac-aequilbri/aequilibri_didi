import { cookies } from "next/headers";
import Link from "next/link";
import { prisma as db } from "@/lib/db";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

// Bin helpers: L bins = low(1-2), medium(3), high(4-5)
// Same for Impact
const BINS = [
  { label: "Low (1-2)", min: 1, max: 2 },
  { label: "Med (3)", min: 3, max: 3 },
  { label: "High (4-5)", min: 4, max: 5 },
] as const;

function binIndex(val: number) {
  if (val <= 2) return 0;
  if (val === 3) return 1;
  return 2;
}

function cellBg(count: number) {
  if (count === 0) return "bg-neutral-100";
  if (count === 1) return "bg-yellow-100";
  return "bg-red-100";
}

export default async function RisksPage() {
  let risks: Awaited<ReturnType<typeof db.uc3Risk.findMany>> = [];

  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;
    let tenantId: number | null = val ? Number(val) : null;
    if (!tenantId) {
      const fallback = await db.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }
    if (tenantId) {
      risks = await db.uc3Risk.findMany({
        where: { tenantId },
        orderBy: { id: "desc" },
        include: { project: { select: { name: true } } },
      });
    }
  } catch {
    // graceful empty state
  }

  const open = risks.filter((r) => r.status === "open").length;
  const mitigated = risks.filter((r) => r.status === "mitigated").length;
  const high = risks.filter((r) => r.likelihood >= 4 && r.impact >= 4).length;
  const total = risks.length;

  // Build 3x3 heatmap matrix [impactBin][likelihoodBin]
  // Rows = Impact (high at top), Cols = Likelihood (low to high)
  const matrix: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const r of risks) {
    const li = binIndex(r.likelihood);
    const ii = binIndex(r.impact);
    matrix[ii][li]++;
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Risk Register"
        subtitle="Track and manage project risks"
        actions={[{ href: "/uc3/risks/new", label: "+ New Risk" }]}
      />

      <div className="px-8 space-y-6">
        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={total} label="Total Risks" />
          <MetricCard value={open} label="Open" />
          <MetricCard value={mitigated} label="Mitigated" />
          <MetricCard value={high} label="High Severity" />
        </div>

        {/* Heatmap */}
        <div className="ae-card p-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-4">
            Risk Heatmap (Likelihood × Impact)
          </h2>
          <div className="overflow-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-24 text-right pr-2 text-neutral-500 font-normal pb-1">
                    Impact ↓ / Likelihood →
                  </th>
                  {BINS.map((b) => (
                    <th
                      key={b.label}
                      className="w-28 text-center font-semibold text-neutral-600 pb-1"
                    >
                      {b.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...BINS].reverse().map((ib, revIdx) => {
                  const ii = 2 - revIdx; // high impact first
                  return (
                    <tr key={ib.label}>
                      <td className="text-right pr-2 text-neutral-500 font-normal py-1">
                        {ib.label}
                      </td>
                      {BINS.map((_lb, li) => {
                        const count = matrix[ii][li];
                        return (
                          <td
                            key={li}
                            className={`${cellBg(count)} border border-neutral-200 text-center py-3 px-2 font-semibold`}
                          >
                            {count > 0 ? count : ""}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-neutral-400 mt-2">
              <span className="inline-block w-3 h-3 bg-neutral-100 border border-neutral-200 mr-1 align-middle" />
              Empty
              <span className="inline-block w-3 h-3 bg-yellow-100 border border-neutral-200 mx-1 ml-3 align-middle" />
              1 risk
              <span className="inline-block w-3 h-3 bg-red-100 border border-neutral-200 mx-1 ml-3 align-middle" />
              2+ risks
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="ae-card overflow-hidden">
          {risks.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No risks recorded.{" "}
              <Link href="/uc3/risks/new" className="text-blue-600 underline">
                Add the first one.
              </Link>
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Project</th>
                  <th>Owner</th>
                  <th>Likelihood</th>
                  <th>Impact</th>
                  <th>Status</th>
                  <th>Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-xs">
                      <span className="line-clamp-2">{r.description}</span>
                    </td>
                    <td>
                      {(r as typeof r & { project?: { name: string } | null })
                        .project?.name ?? "—"}
                    </td>
                    <td>{r.owner ?? "—"}</td>
                    <td className="text-center">{r.likelihood}</td>
                    <td className="text-center">{r.impact}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-2 text-neutral-500">
                        {r.mitigation ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
