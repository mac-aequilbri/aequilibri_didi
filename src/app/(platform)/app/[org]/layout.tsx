import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { buildNav } from "@/lib/platform/nav";
import { requireOrgCtx } from "@/lib/platform/org-context";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await requireOrgCtx(org);
  const f = ctx.config.features;
  const [jobCount, pendingCount, openActions, openRisks, openVariations] = await Promise.all([
    prisma.platJob.count({ where: { orgId: ctx.orgId } }),
    prisma.platPendingWrite.count({ where: { orgId: ctx.orgId, status: "proposed" } }),
    prisma.platActionHub.count({
      where: { orgId: ctx.orgId, status: { in: ["open", "in_progress"] } },
    }),
    f.risks
      ? prisma.platConRisk.count({ where: { orgId: ctx.orgId, status: "open" } })
      : Promise.resolve(0),
    f.variations
      ? prisma.platConVariationOrder.count({ where: { orgId: ctx.orgId, status: "submitted" } })
      : Promise.resolve(0),
  ]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        sections={buildNav(ctx, jobCount, {
          pending: pendingCount,
          openActions,
          openRisks,
          openVariations,
        })}
        orgName={ctx.orgName}
        pendingCount={pendingCount}
      />
      <main className="flex-1 overflow-auto min-w-0">
        <Breadcrumbs orgName={ctx.orgName} orgSlug={ctx.orgSlug} />
        {children}
      </main>
    </div>
  );
}
