import { notFound } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { getTenantId } from "@/lib/uc3-tenant";
import { PageHeader } from "@/components/PageHeader";
import { addBimModel } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

export default async function NewModelPage({
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

  const project = await db.uc3Project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  return (
    <div className="pb-16">
      <PageHeader
        title="Add 3D Model"
        subtitle={`Attach a BIMx hyper-model to ${project.name}`}
        actions={[
          { href: `/uc3/projects/${projectId}/models`, label: "Back to Models", variant: "outline" },
        ]}
      />

      <div className="px-8">
        <div className="ae-card p-6 max-w-2xl">
          {error === "name_required" && (
            <p className="text-red-600 text-sm mb-4">Model name is required.</p>
          )}
          {error === "invalid_url" && (
            <p className="text-red-600 text-sm mb-4">
              That embed link was rejected. Paste a BIMx share link or embed snippet from
              bimx.graphisoft.com (https only).
            </p>
          )}

          <div className="mb-5 rounded-md bg-blue-50 dark:bg-blue-950/40 p-4 text-xs text-neutral-600 dark:text-neutral-300">
            <p className="font-medium text-neutral-700 dark:text-neutral-200 mb-1">
              How to get the link
            </p>
            Upload your hyper-model to{" "}
            <span className="font-mono">bimx.graphisoft.com</span>, open it, and use{" "}
            <span className="font-medium">Share → Embed Hyper-model</span>. Paste either the
            share URL or the whole <span className="font-mono">&lt;iframe&gt;</span> snippet
            below — we&apos;ll extract the link automatically.
          </div>

          <form action={addBimModel} className="space-y-4">
            <input type="hidden" name="projectId" value={projectId} />

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Model Name <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                type="text"
                required
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Architectural model — Rev C"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                BIMx Share Link or Embed Snippet <span className="text-red-500">*</span>
              </label>
              <textarea
                name="embedUrl"
                rows={3}
                required
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder='https://bimx.graphisoft.com/model/...  —or—  <iframe src="https://bimx.graphisoft.com/...">'
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Added By
              </label>
              <input
                name="addedBy"
                type="text"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Jane Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Notes</label>
              <textarea
                name="notes"
                rows={2}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional notes about this model"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="clientVisible" className="rounded border-neutral-300" />
              Show this model to clients in the public portal
            </label>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-ae">
                Add Model
              </button>
              <a href={`/uc3/projects/${projectId}/models`} className="btn-ae-outline">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
