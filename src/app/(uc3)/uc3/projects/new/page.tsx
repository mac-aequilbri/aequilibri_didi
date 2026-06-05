import { PageHeader } from "@/components/PageHeader";
import { createProject } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div>
      <PageHeader
        title="New Project"
        subtitle="Create a new construction project"
        actions={[{ href: "/uc3/projects", label: "Back to Projects", variant: "outline" }]}
      />

      <div className="px-8 pb-8 max-w-xl">
        {error === "name_required" && (
          <div className="ae-card p-3 mb-4 text-red-600 text-sm border border-red-200 bg-red-50">
            Project name is required.
          </div>
        )}

        <div className="ae-card p-6">
          <form action={createProject} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="name">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g. Riverside Apartments Stage 2"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="client">
                Client
              </label>
              <input
                id="client"
                name="client"
                type="text"
                placeholder="e.g. Acme Developments"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue="planning"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="complete">Complete</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="startDate">
                  Start Date
                </label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="endDate">
                  End Date
                </label>
                <input
                  id="endDate"
                  name="endDate"
                  type="date"
                  className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-ae">
                Create Project
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
