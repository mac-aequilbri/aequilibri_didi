import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { updateActionStatus } from "../actions";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["open", "in_progress", "complete", "overdue"] as const;
type ActionStatus = (typeof STATUS_OPTIONS)[number];

const FILTER_TABS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Complete", value: "complete" },
  { label: "Overdue", value: "overdue" },
];

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  let actions: Awaited<ReturnType<typeof prisma.uc2ActionHub.findMany>> = [];

  try {
    actions = await prisma.uc2ActionHub.findMany({
      where: status ? { status: status as ActionStatus } : undefined,
      orderBy: { createdAt: "desc" },
    });
  } catch {
    // empty state on error
  }

  return (
    <div>
      <PageHeader
        title="Action Hub"
        subtitle="Track and manage all project actions"
        actions={[{ href: "/uc2/actions/new", label: "+ New Action" }]}
      />

      <div className="px-8 space-y-4">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => {
            const href =
              tab.value ? `/uc2/actions?status=${tab.value}` : "/uc2/actions";
            const isActive = (status ?? "") === tab.value;
            return (
              <Link
                key={tab.value}
                href={href}
                className={isActive ? "btn-ae text-sm" : "btn-ae-outline text-sm"}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Table */}
        {actions.length === 0 ? (
          <div className="ae-card p-6 text-neutral-500 text-sm">
            No actions found.{" "}
            <Link href="/uc2/actions/new" className="underline">
              Create one.
            </Link>
          </div>
        ) : (
          <div className="ae-card overflow-x-auto">
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Update Status</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((item) => (
                  <tr key={item.id}>
                    <td className="max-w-xs">
                      <span className="line-clamp-2 text-sm">{item.action}</span>
                    </td>
                    <td className="text-sm whitespace-nowrap">{item.owner}</td>
                    <td className="text-sm whitespace-nowrap">
                      {item.dueDate ? formatDate(item.dueDate) : "—"}
                    </td>
                    <td>
                      <span
                        className={`text-xs font-semibold uppercase px-2 py-0.5 rounded
                          ${item.priority === "critical" ? "bg-red-100 text-red-700" : ""}
                          ${item.priority === "high" ? "bg-orange-100 text-orange-700" : ""}
                          ${item.priority === "medium" ? "bg-yellow-100 text-yellow-700" : ""}
                          ${item.priority === "low" ? "bg-neutral-100 text-neutral-600" : ""}
                        `}
                      >
                        {item.priority}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      <form action={updateActionStatus} className="flex gap-1 items-center">
                        <input type="hidden" name="id" value={item.id} />
                        <select
                          name="status"
                          defaultValue={item.status}
                          className="text-xs border border-neutral-300 rounded px-1 py-0.5 bg-white"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-ae text-xs px-2 py-0.5">
                          Save
                        </button>
                      </form>
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
