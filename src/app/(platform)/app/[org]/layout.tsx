import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
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
  const jobCount = await prisma.platJob.count({ where: { orgId: ctx.orgId } });

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar sections={buildNav(ctx, jobCount)} orgName={ctx.orgName} />
      <main className="flex-1 overflow-auto min-w-0">{children}</main>
    </div>
  );
}
