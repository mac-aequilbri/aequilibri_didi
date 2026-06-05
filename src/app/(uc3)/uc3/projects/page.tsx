import Link from "next/link";
import { prisma as db } from "@/lib/db";
import { getTenantId } from "@/lib/uc3-tenant";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["planning", "active", "on_hold", "complete"] as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const tenantId = await getTenantId();

  let projects: {
    id: number;
    name: string;
    client: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    healthScore: number | null;
  }[] = [];

  try {
    if (tenantId) {
      projects = await db.uc3Project.findMany({
        where: {
          tenantId,
          ...(status ? { status } : {}),
        },
        orderBy: { id: "desc" },
        select: {
          id: true,
          name: true,
          client: true,
          status: true,
          startDate: true,
          endDate: true,
          healthScore: true,
        },
      });
    }
  } catch {
    // empty state
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="All construction projects for this tenant"
        actions={[{ href: "/uc3/projects/new", label: "+ New Project" }]}
      />

      <div className="px-8 pb-8">
        {/* Status filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Link
            href="/uc3/projects"
            className={!status ? "btn-ae" : "btn-ae-outline"}
          >
            All
          </Link>
          {STATUS_OPTIONS.map((s) => (
            <Link
              key={s}
              href={`/uc3/projects?status=${s}`}
              className={status === s ? "btn-ae" : "btn-ae-outline"}
            >
              {s.replace("_", " ")}
            </Link>
          ))}
        </div>

        {projects.length === 0 ? (
          <div className="ae-card p-8 text-center text-neutral-500">
            No projects found.{" "}
            <Link href="/uc3/projects/new" className="text-blue-600 underline">
              Create your first project
            </Link>
          </div>
        ) : (
          <div className="ae-card overflow-hidden">
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Health</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">
                      <Link
                        href={`/uc3/projects/${p.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.client}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="text-neutral-500 text-sm">
                      {p.startDate ? formatDate(p.startDate) : "—"}
                    </td>
                    <td className="text-neutral-500 text-sm">
                      {p.endDate ? formatDate(p.endDate) : "—"}
                    </td>
                    <td>
                      {p.healthScore != null ? (
                        <span
                          className={
                            p.healthScore >= 70
                              ? "text-green-600 font-semibold"
                              : p.healthScore >= 40
                              ? "text-yellow-600 font-semibold"
                              : "text-red-600 font-semibold"
                          }
                        >
                          {p.healthScore}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/uc3/projects/${p.id}/edit`}
                        className="btn-ae-outline text-xs"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
