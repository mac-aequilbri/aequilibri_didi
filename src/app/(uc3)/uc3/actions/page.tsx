import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const STATUS_OPTIONS = ["", "open", "in_progress", "complete", "overdue", "cancelled"];
const PRIORITY_OPTIONS = ["", "low", "medium", "high", "critical"];

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: string; priority?: string }>;
}) {
  const params = await searchParams;
  const tenantId = await getTenantId();

  let actions: {
    id: number;
    title: string;
    owner: string | null;
    dueDate: Date | null;
    priority: string;
    status: string;
    createdByAi: boolean;
    project: { id: number; name: string } | null;
  }[] = [];

  let projects: { id: number; name: string }[] = [];

  if (tenantId) {
    try {
      const where: Record<string, unknown> = { tenantId };
      if (params.projectId) where.projectId = Number(params.projectId);
      if (params.status) where.status = params.status;
      if (params.priority) where.priority = params.priority;

      [actions, projects] = await Promise.all([
        db.uc3ActionItem.findMany({
          where,
          orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
          include: { project: { select: { id: true, name: true } } },
        }),
        db.uc3Project.findMany({
          where: { tenantId, status: { not: "complete" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
    } catch {
      // empty state on error
    }
  }

  const now = new Date();

  function isOverdue(item: { status: string; dueDate: Date | null }) {
    return (
      item.status !== "complete" &&
      item.status !== "cancelled" &&
      item.dueDate !== null &&
      item.dueDate < now
    );
  }

  return (
    <div>
      <PageHeader
        title="Action Items"
        subtitle={`${actions.length} item${actions.length !== 1 ? "s" : ""}`}
        actions={[{ href: "/uc3/actions/new", label: "+ New Action" }]}
      />

      <div className="px-8 pb-8">
        {/* Filters */}
        <form method="GET" className="flex flex-wrap gap-3 mb-6">
          <select name="projectId" defaultValue={params.projectId ?? ""} className="ae-input text-sm">
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select name="status" defaultValue={params.status ?? ""} className="ae-input text-sm">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "All Statuses" : s.replace("_", " ")}
              </option>
            ))}
          </select>

          <select name="priority" defaultValue={params.priority ?? ""} className="ae-input text-sm">
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p === "" ? "All Priorities" : PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>

          <button type="submit" className="btn-ae-outline text-sm">
            Filter
          </button>
          <Link href="/uc3/actions" className="btn-ae-outline text-sm">
            Clear
          </Link>
        </form>

        {actions.length === 0 ? (
          <div className="ae-card p-8 text-center text-neutral-500">
            No action items found.{" "}
            <Link href="/uc3/actions/new" className="text-blue-600 underline">
              Create one
            </Link>
            .
          </div>
        ) : (
          <div className="ae-card overflow-hidden">
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Title</th>
                  <th className="text-left">Project</th>
                  <th className="text-left">Owner</th>
                  <th className="text-left">Due Date</th>
                  <th className="text-left">Priority</th>
                  <th className="text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((item) => {
                  const overdue = isOverdue(item);
                  return (
                    <tr key={item.id} className={overdue ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <td className="font-medium">
                        {item.title}
                        {item.createdByAi && (
                          <span className="ml-2 text-xs text-violet-500">(AI)</span>
                        )}
                      </td>
                      <td className="text-neutral-600 dark:text-neutral-400">
                        {item.project?.name ?? <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="text-neutral-600 dark:text-neutral-400">
                        {item.owner ?? <span className="text-neutral-400">—</span>}
                      </td>
                      <td className={overdue ? "text-red-600 font-medium" : "text-neutral-600 dark:text-neutral-400"}>
                        {item.dueDate ? formatDate(item.dueDate) : "—"}
                        {overdue && <span className="ml-1 text-xs">(overdue)</span>}
                      </td>
                      <td>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            item.priority === "critical"
                              ? "bg-red-100 text-red-700"
                              : item.priority === "high"
                              ? "bg-orange-100 text-orange-700"
                              : item.priority === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {PRIORITY_LABELS[item.priority] ?? item.priority}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
