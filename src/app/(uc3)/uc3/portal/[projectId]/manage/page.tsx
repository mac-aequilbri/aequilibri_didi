import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { generatePortalToken, deactivateToken } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function ManagePortalPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId: projectIdRaw } = await params;
  const projectId = Number(projectIdRaw);

  let project: { id: number; name: string; client: string | null } | null =
    null;
  let tokens: {
    id: number;
    token: string;
    label: string | null;
    isActive: boolean;
    viewsCount: number;
    expiresAt: Date | null;
    createdAt: Date;
  }[] = [];

  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;
    let tenantId: number | null = val ? Number(val) : null;
    if (!tenantId) {
      const fallback = await db.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }

    if (tenantId) {
      [project, tokens] = await Promise.all([
        db.uc3Project.findFirst({
          where: { id: projectId, tenantId },
          select: { id: true, name: true, client: true },
        }),
        db.uc3ClientPortalToken.findMany({
          where: { projectId, tenantId },
          orderBy: { createdAt: "desc" },
        }),
      ]);
    }
  } catch {
    // graceful empty state
  }

  if (!project) notFound();

  return (
    <div className="pb-16">
      <PageHeader
        title={`Portal Tokens — ${project.name}`}
        subtitle={project.client ? `Client: ${project.client}` : undefined}
        actions={[
          { href: "/uc3/portal", label: "All Tokens", variant: "outline" },
          { href: `/uc3/projects/${project.id}`, label: "Project", variant: "outline" },
        ]}
      />

      <div className="px-8 space-y-6">
        {/* Generate token form */}
        <div className="ae-card p-6 space-y-4">
          <h2 className="text-base font-semibold">Generate New Token</h2>
          <form action={generatePortalToken} className="space-y-4">
            <input type="hidden" name="projectId" value={project.id} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Label <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  type="text"
                  name="label"
                  placeholder="e.g. ABC Corp access link"
                  className="ae-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Expires At <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  name="expiresAt"
                  className="ae-input w-full"
                />
              </div>
            </div>

            <div>
              <button type="submit" className="btn-ae">
                Generate Token
              </button>
            </div>
          </form>
        </div>

        {/* Existing tokens */}
        <div className="ae-card overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200">
            <h2 className="text-sm font-semibold text-neutral-700">
              Existing Tokens ({tokens.length})
            </h2>
          </div>

          {tokens.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No tokens generated yet for this project.
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Token link</th>
                  <th>Views</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.label ?? "—"}</td>
                    <td className="font-mono text-xs text-neutral-500">
                      <Link
                        href={`/uc3/portal/public/${t.token}`}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        /portal/public/{t.token.slice(0, 12)}…
                      </Link>
                    </td>
                    <td className="text-center text-neutral-600">
                      {t.viewsCount}
                    </td>
                    <td className="text-neutral-500 text-sm">
                      {t.expiresAt ? formatDate(t.expiresAt) : "Never"}
                    </td>
                    <td className="text-neutral-500 text-sm">
                      {formatDate(t.createdAt)}
                    </td>
                    <td>
                      <StatusBadge status={t.isActive ? "active" : "cancelled"} />
                    </td>
                    <td>
                      {t.isActive && (
                        <form action={deactivateToken}>
                          <input type="hidden" name="tokenId" value={t.id} />
                          <button
                            type="submit"
                            className="btn-ae-outline text-xs text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Deactivate
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
