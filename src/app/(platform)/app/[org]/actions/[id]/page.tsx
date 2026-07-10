// Single-action edit page. Reachable by clicking a row on the Action Hub.

import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { loadAction } from "@/lib/platform/actionsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import ActionEditor from "./ActionEditor";

export const dynamic = "force-dynamic";

export default async function ActionDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const action = await loadAction(ctx, id);
  const backHref = orgPath(ctx.orgSlug, "/actions");

  if (!action) {
    return (
      <div className="p-6 max-w-xl">
        <PageHeader title="Action" actions={[{ href: backHref, label: "← Back to actions", variant: "outline" }]} />
        <div className="ae-card p-5">
          <EmptyState
            title="Action not found"
            hint="It may have been removed, or the link is out of date."
            action={{ href: backHref, label: "Back to Action Hub" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title="Edit action" subtitle={action.title} />
      <ActionEditor orgSlug={ctx.orgSlug} action={action} backHref={backHref} />
    </div>
  );
}
