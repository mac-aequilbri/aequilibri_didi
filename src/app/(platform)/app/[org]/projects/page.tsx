import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, toNum } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const jobs = await prisma.platJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { conPhases: true, actions: true, conRisks: true } } },
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Projects"
        subtitle="Every engagement — long projects and short jobs — on the shared core."
        actions={[{ href: orgPath(ctx.orgSlug, "/projects/new"), label: "+ New project" }]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={orgPath(ctx.orgSlug, `/projects/${job.id}`)}
            className="ae-card p-5 block hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{job.name}</h2>
                <p className="text-xs text-neutral-500">
                  {job.code} · {job.engagementType.replace("_", " ")} ·{" "}
                  {job.suburb || job.address || "no address"}
                </p>
              </div>
              <StatusBadge status={job.status} />
            </div>
            <div className="mt-3 h-2 rounded bg-neutral-100 overflow-hidden">
              <div
                className="h-full rounded bg-[var(--ae-space,#1f2937)]"
                style={{ width: `${job.completionPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {job.completionPct}% complete · health {job.healthScore}/100 · budget{" "}
              {currency(toNum(job.budgetTotal))} · {job._count.conPhases} phases ·{" "}
              {job._count.actions} actions · {job._count.conRisks} risks
            </p>
          </Link>
        ))}
        {jobs.length === 0 && <p className="text-sm text-neutral-500">No projects yet.</p>}
      </div>
    </div>
  );
}
