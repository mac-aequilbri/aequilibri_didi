import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { createAction, updateActionStatus, deleteAction } from "./actions";

export const dynamic = "force-dynamic";

const PRIORITY_COLOR: Record<string, string> = {
  P1: "bg-red-100 text-red-800",
  P2: "bg-amber-100 text-amber-800",
  P3: "bg-neutral-100 text-neutral-600",
};

const STATUS_COLOR: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  done: "bg-green-50 text-green-700",
  deferred: "bg-neutral-100 text-neutral-400",
};

export default async function ActionHubPage() {
  let actions: Awaited<ReturnType<typeof prisma.uc1ActionHub.findMany>> = [];
  try {
    actions = await prisma.uc1ActionHub.findMany({ orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }] });
  } catch { actions = []; }

  const open = actions.filter((a) => a.status === "open" || a.status === "in_progress");
  const overdue = open.filter((a) => a.dueDate && a.dueDate < new Date());

  return (
    <div>
      <PageHeader title="Action Hub" subtitle="Prospective memory — time and event-triggered commitments" />
      <div className="px-8 space-y-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <MetricCard value={open.length} label="Open actions" />
          <MetricCard value={overdue.length} label="Overdue" />
          <MetricCard value={actions.filter((a) => a.priority === "P1").length} label="P1 priority" />
          <MetricCard value={actions.filter((a) => a.status === "done").length} label="Completed" />
        </div>

        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead>
              <tr><th>P</th><th>Action</th><th>Trigger condition</th><th>Due</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {actions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No actions. Add one below.</td></tr>
              ) : (
                actions.map((a) => (
                  <tr key={a.id} className={a.status === "done" ? "opacity-40" : ""}>
                    <td>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${PRIORITY_COLOR[a.priority] ?? ""}`}>{a.priority}</span>
                    </td>
                    <td className="max-w-md">
                      <div>{a.action}</div>
                      {a.notes && <div className="text-xs text-neutral-400">{a.notes}</div>}
                    </td>
                    <td className="text-xs text-neutral-500">{a.triggerCondition || "—"}</td>
                    <td className={`text-sm ${a.dueDate && a.dueDate < new Date() && a.status !== "done" ? "text-red-600 font-medium" : ""}`}>
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                    </td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[a.status] ?? ""}`}>{a.status}</span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <form action={updateActionStatus} className="inline mr-1">
                        <input type="hidden" name="id" value={a.id} />
                        <select name="status" defaultValue={a.status} className="text-xs border border-[var(--ae-earth)] rounded px-1 py-0.5 mr-1">
                          <option value="open">open</option>
                          <option value="in_progress">in_progress</option>
                          <option value="done">done</option>
                          <option value="deferred">deferred</option>
                        </select>
                        <button className="btn-ae-outline text-xs">Save</button>
                      </form>
                      <form action={deleteAction} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-xs text-red-700">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form action={createAction} className="ae-card p-5 space-y-3">
          <h2 className="font-semibold">Add Action</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="action" placeholder="Action description" required className="border border-[var(--ae-earth)] rounded px-3 py-2 sm:col-span-2" />
            <select name="priority" className="border border-[var(--ae-earth)] rounded px-3 py-2">
              <option value="P1">P1 — Critical</option>
              <option value="P2" selected>P2 — Important</option>
              <option value="P3">P3 — Nice to have</option>
            </select>
            <input name="due_date" type="date" className="border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="trigger_condition" placeholder="Trigger condition (optional)" className="border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="notes" placeholder="Notes" className="border border-[var(--ae-earth)] rounded px-3 py-2" />
          </div>
          <button className="btn-ae">Add Action</button>
        </form>
      </div>
    </div>
  );
}
