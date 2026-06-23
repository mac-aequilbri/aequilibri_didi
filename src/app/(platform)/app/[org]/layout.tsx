import { Sidebar } from "@/components/Sidebar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CommandSearch } from "@/components/CommandSearch";
import { buildNav } from "@/lib/platform/nav";
import { loadNavCounts } from "@/lib/platform/navCountsSource";
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
  const counts = await loadNavCounts(ctx);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        sections={buildNav(ctx, counts.jobs, {
          pending: counts.pending,
          openActions: counts.openActions,
          openRisks: counts.openRisks,
          openVariations: counts.openVariations,
        })}
        orgName={ctx.orgName}
        pendingCount={counts.pending}
      />
      <main className="flex-1 overflow-auto min-w-0">
        <div className="flex items-center gap-3 px-6 pt-3">
          <Breadcrumbs orgName={ctx.orgName} orgSlug={ctx.orgSlug} />
          <div className="ml-auto shrink-0">
            <CommandSearch orgSlug={ctx.orgSlug} />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
