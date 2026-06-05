import { notFound } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { getTenantId } from "@/lib/uc3-tenant";
import { PageHeader } from "@/components/PageHeader";
import { updateProject } from "../../../actions";

export const dynamic = "force-dynamic";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const projectId = Number(id);
  const tenantId = await getTenantId();

  if (!tenantId || isNaN(projectId)) notFound();

  let project: {
    id: number;
    name: string;
    client: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
  } | null = null;

  try {
    project = await db.uc3Project.findFirst({
      where: { id: projectId, tenantId },
      select: {
        id: true,
        name: true,
        client: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });
  } catch {
    // fall through to notFound
  }

  if (!project) notFound();

  // Bind projectId into the server action
  const updateProjectWithId = updateProject.bind(null, projectId);

  return (
    <div>
      <PageHeader
        title="Edit Project"
        subtitle={project.name}
        actions={[
          { href: `/uc3/projects/${projectId}`, label: "Back to Project", variant: "outline" },
        ]}
      />

      <div className="px-8 pb-8 max-w-xl">
        {error === "name_required" && (
          <div className="ae-card p-3 mb-4 text-red-600 text-sm border border-red-200 bg-red-50">
            Project name is required.
          </div>
        )}

        <div className="ae-card p-6">
          <form action={updateProjectWithId} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="name">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={project.name}
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
                defaultValue={project.client}
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
                defaultValue={project.status}
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
                  defaultValue={toDateInput(project.startDate)}
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
                  defaultValue={toDateInput(project.endDate)}
                  className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-ae">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
