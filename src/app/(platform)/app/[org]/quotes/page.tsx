// Quotes across the org's jobs — client-facing priced offers. New quotes can
// be started blank or generated from a job's assessment budget breakdown.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function QuotesPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const quotes = await prisma.platConQuote.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: { job: { select: { name: true, code: true } } },
  });

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Quotes"
        subtitle="Client-facing priced offers. Generate one from a job's budget, refine the lines, then send and track acceptance."
        actions={[{ href: orgPath(ctx.orgSlug, "/quotes/new"), label: "+ New quote" }]}
      />

      {quotes.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No quotes yet. <Link className="underline" href={orgPath(ctx.orgSlug, "/quotes/new")}>Create one</Link>.
        </p>
      ) : (
        <section className="ae-card p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[40rem]">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-2">Ref</th>
                  <th className="py-1 pr-2">Quote</th>
                  <th className="py-1 pr-2">Job</th>
                  <th className="py-1 pr-2">Valid until</th>
                  <th className="py-1 pr-2 text-right">Total</th>
                  <th className="py-1 pr-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-t border-neutral-100">
                    <td className="py-2 pr-2 font-mono text-xs">{q.refNumber}</td>
                    <td className="py-2 pr-2">
                      <Link className="font-medium hover:underline" href={orgPath(ctx.orgSlug, `/quotes/${q.id}`)}>
                        {q.title}
                      </Link>
                      {q.clientName ? (
                        <span className="block text-xs text-neutral-500">{q.clientName}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-xs text-neutral-500">{q.job.code}</td>
                    <td className="py-2 pr-2 text-xs">{formatDate(q.validUntil)}</td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap font-semibold">
                      {currency(q.total)}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <StatusBadge status={q.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
