import Link from "next/link";
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
    <div className="flex min-h-screen">
      <div className="flex flex-col w-56 shrink-0">
        <div className="px-4 py-2 text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
          <Link href="/app" className="hover:underline" title="Switch organisation">
            Org:{" "}
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              {ctx.orgName}
            </span>
          </Link>
        </div>
        <Sidebar sections={buildNav(ctx, jobCount)} />
      </div>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
