import { Sidebar } from "@/components/Sidebar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CommandSearch } from "@/components/CommandSearch";
import { buildNav } from "@/lib/platform/nav";
import { loadNavCounts } from "@/lib/platform/navCountsSource";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await requireOrgCtx(org);
  const [counts, viewer] = await Promise.all([loadNavCounts(ctx), getCurrentViewer(ctx)]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Sidebar
        sections={buildNav(
          ctx,
          counts.jobs,
          {
            pending: counts.pending,
            openActions: counts.openActions,
            openRisks: counts.openRisks,
            openVariations: counts.openVariations,
          },
          viewer.role,
        )}
        orgName={ctx.orgName}
        orgLogo={ctx.config.branding?.logo}
        pendingCount={counts.pending}
      />
      <main id="main" className="flex-1 overflow-auto min-w-0">
        <div className="flex items-center gap-3 px-6 pt-3">
          <Breadcrumbs orgName={ctx.orgName} orgSlug={ctx.orgSlug} orgLogo={ctx.config.branding?.logo} />
          <div className="ml-auto shrink-0">
            <CommandSearch orgSlug={ctx.orgSlug} />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
