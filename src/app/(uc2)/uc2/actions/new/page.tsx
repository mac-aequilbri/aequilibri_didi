import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { createAction } from "../../actions";

export const dynamic = "force-dynamic";

export default function NewActionPage() {
  return (
    <div>
      <PageHeader
        title="New Action"
        subtitle="Add a new item to the Action Hub"
        actions={[{ href: "/uc2/actions", label: "Back to Actions", variant: "outline" }]}
      />

      <div className="px-8">
        <div className="ae-card p-6 max-w-xl">
          <form action={createAction} className="space-y-5">
            {/* Action description */}
            <div className="space-y-1">
              <label
                htmlFor="action"
                className="block text-sm font-medium text-neutral-700"
              >
                Action <span className="text-red-500">*</span>
              </label>
              <textarea
                id="action"
                name="action"
                rows={3}
                required
                placeholder="Describe the action to be taken…"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-none"
              />
            </div>

            {/* Owner */}
            <div className="space-y-1">
              <label
                htmlFor="owner"
                className="block text-sm font-medium text-neutral-700"
              >
                Owner
              </label>
              <input
                id="owner"
                name="owner"
                type="text"
                placeholder="e.g. Didi, Anton, Contractor"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            </div>

            {/* Due date */}
            <div className="space-y-1">
              <label
                htmlFor="dueDate"
                className="block text-sm font-medium text-neutral-700"
              >
                Due Date
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label
                htmlFor="priority"
                className="block text-sm font-medium text-neutral-700"
              >
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                defaultValue="medium"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" className="btn-ae">
                Create Action
              </button>
              <Link href="/uc2/actions" className="btn-ae-outline">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
