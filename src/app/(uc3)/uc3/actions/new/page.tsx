import { PageHeader } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import Link from "next/link";
import { createActionItem } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewActionItemPage() {
  const tenantId = await getTenantId();

  let projects: { id: number; name: string }[] = [];
  if (tenantId) {
    try {
      projects = await db.uc3Project.findMany({
        where: { tenantId, status: { not: "complete" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
    } catch {
      // empty state on error
    }
  }

  return (
    <div>
      <PageHeader title="New Action Item" subtitle="Create a tracked action" />

      <div className="px-8 pb-8 max-w-xl">
        <div className="ae-card p-6">
          <form action={createActionItem} className="flex flex-col gap-5">
            {/* Title */}
            <div className="flex flex-col gap-1">
              <label htmlFor="title" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="e.g. Submit council permit application"
                className="ae-input"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Additional details…"
                className="ae-input resize-none"
              />
            </div>

            {/* Owner */}
            <div className="flex flex-col gap-1">
              <label htmlFor="owner" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Owner
              </label>
              <input
                id="owner"
                name="owner"
                type="text"
                placeholder="e.g. Jane Smith"
                className="ae-input"
              />
            </div>

            {/* Due Date */}
            <div className="flex flex-col gap-1">
              <label htmlFor="dueDate" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Due Date
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="ae-input"
              />
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-1">
              <label htmlFor="priority" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Priority
              </label>
              <select id="priority" name="priority" defaultValue="medium" className="ae-input">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Project */}
            <div className="flex flex-col gap-1">
              <label htmlFor="projectId" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Project
              </label>
              <select id="projectId" name="projectId" className="ae-input">
                <option value="">— No project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-ae">
                Create Action
              </button>
              <Link href="/uc3/actions" className="btn-ae-outline">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
