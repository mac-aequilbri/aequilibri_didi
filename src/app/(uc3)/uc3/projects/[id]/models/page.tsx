import { notFound } from "next/navigation";
import { prisma as db } from "@/lib/db";
import { getTenantId } from "@/lib/uc3-tenant";
import { PageHeader } from "@/components/PageHeader";
import { BimxViewer } from "@/components/BimxViewer";
import { formatDate } from "@/lib/format";
import { deleteBimModel, updateBimModel } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

export default async function ProjectModelsPage({
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

  const models = await db.uc3BimModel.findMany({
    where: { projectId, tenantId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="pb-16">
      <PageHeader
        title="3D Models"
        subtitle={`BIMx hyper-models for ${project.name}`}
        actions={[
          { href: `/uc3/projects/${projectId}/models/new`, label: "Add Model" },
          { href: `/uc3/projects/${projectId}`, label: "Back to Project", variant: "outline" },
        ]}
      />

      <div className="px-8 space-y-6">
        {error === "invalid_url" && (
          <p className="text-red-600 text-sm">
            That embed link was rejected. Only BIMx (graphisoft.com) share links are allowed.
          </p>
        )}

        {models.length === 0 ? (
          <div className="ae-card p-8 text-center text-neutral-500 text-sm">
            No models attached yet. Upload a hyper-model to the BIMx Model Transfer site
            (bimx.graphisoft.com), copy its share or embed link, then click{" "}
            <span className="font-medium">Add Model</span>.
          </div>
        ) : (
          models.map((m) => (
            <div key={m.id} className="ae-card overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-sm">{m.name}</h2>
                  <p className="text-xs text-neutral-500">
                    Added {formatDate(m.createdAt)}
                    {m.addedBy ? ` by ${m.addedBy}` : ""}
                    {" · "}
                    {m.clientVisible ? (
                      <span className="text-green-600 font-medium">Visible to client</span>
                    ) : (
                      <span className="text-neutral-500">Internal only</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Toggle client visibility */}
                  <form action={updateBimModel}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="name" value={m.name} />
                    <input type="hidden" name="notes" value={m.notes} />
                    <input
                      type="hidden"
                      name="clientVisible"
                      value={m.clientVisible ? "" : "on"}
                    />
                    <button type="submit" className="btn-ae-outline text-xs">
                      {m.clientVisible ? "Hide from client" : "Show to client"}
                    </button>
                  </form>
                  {/* Delete */}
                  <form action={deleteBimModel}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <button
                      type="submit"
                      className="btn-ae-outline text-xs text-red-600 border-red-300 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              <div className="p-4">
                <BimxViewer src={m.embedUrl} title={m.name} />
                {m.notes && (
                  <p className="text-xs text-neutral-500 mt-3 whitespace-pre-wrap">{m.notes}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
