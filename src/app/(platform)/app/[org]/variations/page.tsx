import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, toNum } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function VariationsPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const variations = await prisma.platConVariationOrder.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: { job: { select: { code: true } } },
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Variation Orders"
        subtitle="Scope changes with cost and time impact — AI drafts go through human approval."
        actions={[{ href: orgPath(ctx.orgSlug, "/variations/new"), label: "+ New / AI draft" }]}
      />
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Ref</th>
              <th className="py-1 pr-2">Title</th>
              <th className="py-1 pr-2 text-right">Cost impact</th>
              <th className="py-1 pr-2 text-right">Time</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {variations.map((v) => (
              <tr key={v.id} className="border-t border-neutral-100">
                <td className="py-2 pr-2 whitespace-nowrap font-mono text-xs">
                  <Link href={orgPath(ctx.orgSlug, `/variations/${v.id}`)} className="hover:underline">
                    {v.refNumber || `#${v.id}`}
                  </Link>
                </td>
                <td className="py-2 pr-2">
                  <Link href={orgPath(ctx.orgSlug, `/variations/${v.id}`)} className="font-medium hover:underline">
                    {v.title}
                  </Link>
                  <span className="ml-1 text-xs text-neutral-400">{v.job?.code}</span>
                  {v.isAiDrafted && (
                    <span className="ml-1 text-[0.65rem] px-1 rounded bg-violet-100 text-violet-700">AI</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(toNum(v.costImpact))}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap text-xs">
                  {v.timeImpactDays ? `${v.timeImpactDays}d` : "—"}
                </td>
                <td className="py-2">
                  <StatusBadge status={v.status} />
                </td>
              </tr>
            ))}
            {variations.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={5}>
                  No variation orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
