import { cookies } from "next/headers";
import Link from "next/link";
import { prisma as db } from "@/lib/db";
import { PageHeader, MetricCard, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  "",
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "withdrawn",
];

export default async function VariationsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: string }>;
}) {
  const params = await searchParams;

  let variations: {
    id: number;
    refNumber: string;
    title: string;
    costImpact: import("@prisma/client/runtime/library").Decimal;
    timeImpactDays: number;
    status: string;
    isAiDrafted: boolean;
    submittedBy: string;
    createdAt: Date;
    project: { id: number; name: string } | null;
  }[] = [];

  let projects: { id: number; name: string }[] = [];

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
      const where: Record<string, unknown> = { tenantId };
      if (params.projectId) where.projectId = Number(params.projectId);
      if (params.status) where.status = params.status;

      [variations, projects] = await Promise.all([
        db.uc3VariationOrder.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: { project: { select: { id: true, name: true } } },
        }) as unknown as typeof variations,
        db.uc3Project.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
    }
  } catch {
    // graceful empty state
  }

  const total = variations.length;
  const pending = variations.filter((v) => v.status === "pending_approval").length;
  const approved = variations.filter((v) => v.status === "approved").length;
  const totalCost = variations
    .filter((v) => v.status === "approved")
    .reduce((sum, v) => sum + Number(v.costImpact), 0);

  return (
    <div className="pb-16">
      <PageHeader
        title="Variation Orders"
        subtitle="Track scope changes and cost variations"
        actions={[{ href: "/uc3/variations/new", label: "+ New Variation" }]}
      />

      <div className="px-8 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard value={total} label="Total VOs" />
          <MetricCard value={pending} label="Pending Approval" />
          <MetricCard value={approved} label="Approved" />
          <MetricCard
            value={`$${totalCost.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`}
            label="Approved Cost Impact"
          />
        </div>

        {/* Filters */}
        <form method="GET" className="flex flex-wrap gap-3">
          <select
            name="projectId"
            defaultValue={params.projectId ?? ""}
            className="ae-input text-sm"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="ae-input text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "All Statuses" : s.replace("_", " ")}
              </option>
            ))}
          </select>

          <button type="submit" className="btn-ae-outline text-sm">
            Filter
          </button>
          <Link href="/uc3/variations" className="btn-ae-outline text-sm">
            Clear
          </Link>
        </form>

        {/* Table */}
        <div className="ae-card overflow-hidden">
          {variations.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No variation orders found.{" "}
              <Link href="/uc3/variations/new" className="text-blue-600 underline">
                Create one
              </Link>
              .
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Title</th>
                  <th>Project</th>
                  <th>Cost Impact</th>
                  <th>Time (days)</th>
                  <th>Submitted By</th>
                  <th>Created</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {variations.map((v) => (
                  <tr key={v.id}>
                    <td className="font-mono text-xs text-neutral-500">
                      <Link
                        href={`/uc3/variations/${v.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {v.refNumber}
                      </Link>
                    </td>
                    <td className="font-medium">
                      <Link
                        href={`/uc3/variations/${v.id}`}
                        className="hover:underline"
                      >
                        {v.title}
                      </Link>
                      {v.isAiDrafted && (
                        <span className="ml-2 inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                          AI
                        </span>
                      )}
                    </td>
                    <td className="text-neutral-600">
                      {(v as typeof v & { project?: { name: string } | null }).project
                        ?.name ?? "—"}
                    </td>
                    <td
                      className={
                        Number(v.costImpact) > 0
                          ? "text-red-600 font-medium"
                          : Number(v.costImpact) < 0
                          ? "text-green-600 font-medium"
                          : "text-neutral-600"
                      }
                    >
                      {Number(v.costImpact) >= 0 ? "+" : ""}$
                      {v.costImpact
                        .toNumber()
                        .toLocaleString("en-AU", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="text-center text-neutral-600">
                      {v.timeImpactDays != null ? v.timeImpactDays : "—"}
                    </td>
                    <td className="text-neutral-600">{v.submittedBy ?? "—"}</td>
                    <td className="text-neutral-500 text-sm">
                      {formatDate(v.createdAt)}
                    </td>
                    <td>
                      <StatusBadge status={v.status} />
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
