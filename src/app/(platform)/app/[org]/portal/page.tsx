// Client portal token management — issue and revoke unauthenticated
// read-only links (/portal/<token>).

import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { deactivatePortalToken, generatePortalToken } from "./actions";

export const dynamic = "force-dynamic";

export default async function PortalPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const [jobs, tokens] = await Promise.all([
    prisma.platJob.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.platConPortalToken.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      include: { job: { select: { code: true, name: true } } },
    }),
  ]);

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Client Portal"
        subtitle="Share a read-only, token-gated project view — no login required, no financial data shown."
      />

      <form action={generatePortalToken} className="ae-card p-5 space-y-4 mb-8">
        <h2 className="font-semibold text-sm">Issue new link</h2>
        <div className="grid grid-cols-3 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
            <select name="jobId" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} — {j.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Label</span>
            <input name="label" placeholder="Client rep" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Expires</span>
            <input type="date" name="expiresAt" className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <button type="submit" className="btn-ae">
          Generate link
        </button>
      </form>

      <div className="ae-card p-5">
        <h2 className="font-semibold text-sm mb-3">Issued links</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Job</th>
              <th className="py-1 pr-2">Link</th>
              <th className="py-1 pr-2 text-right">Views</th>
              <th className="py-1 pr-2">Expires</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className={`border-t border-neutral-100 ${t.isActive ? "" : "opacity-50"}`}>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">
                  {t.job?.code}
                  {t.label && <span className="block text-neutral-500">{t.label}</span>}
                </td>
                <td className="py-2 pr-2">
                  {t.isActive ? (
                    <a href={`/portal/${t.token}`} target="_blank" className="font-mono text-xs hover:underline break-all">
                      /portal/{t.token.slice(0, 18)}… ↗
                    </a>
                  ) : (
                    <span className="font-mono text-xs">revoked</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right text-xs">{t.viewsCount}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">
                  {t.expiresAt ? formatDate(t.expiresAt) : "never"}
                </td>
                <td className="py-2 text-right">
                  {t.isActive && (
                    <form action={deactivatePortalToken}>
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="recordId" value={t.id} />
                      <button type="submit" className="btn-ae-outline text-xs text-red-600 border-red-300">
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {tokens.length === 0 && (
              <tr>
                <td className="py-4 text-neutral-500" colSpan={5}>
                  No portal links issued yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
