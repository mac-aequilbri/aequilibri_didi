import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BimxViewer } from "@/components/BimxViewer";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { deleteBimModel, setBimModelVisibility } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ProjectModelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { org, id } = await params;
  const { error } = await searchParams;
  const ctx = await requireOrgCtx(org);
  const jobId = Number(id);
  if (isNaN(jobId)) notFound();

  const job = await prisma.platJob.findFirst({
    where: { id: jobId, orgId: ctx.orgId },
    select: { id: true, name: true },
  });
  if (!job) notFound();

  const models = await prisma.platConBimModel.findMany({
    where: { jobId, orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
  });
  const p = (path: string) => orgPath(ctx.orgSlug, path);

  return (
    <div className="pb-16">
      <PageHeader
        title="3D Models"
        subtitle={`BIMx hyper-models for ${job.name}`}
        actions={[
          { href: p(`/projects/${jobId}/models/new`), label: "Add Model" },
          { href: p(`/projects/${jobId}`), label: "Back to Project", variant: "outline" },
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
                  <form action={setBimModelVisibility}>
                    <input type="hidden" name="org" value={ctx.orgSlug} />
                    <input type="hidden" name="recordId" value={m.id} />
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="clientVisible" value={m.clientVisible ? "false" : "true"} />
                    <button type="submit" className="btn-ae-outline text-xs">
                      {m.clientVisible ? "Hide from client" : "Show to client"}
                    </button>
                  </form>
                  <form action={deleteBimModel}>
                    <input type="hidden" name="org" value={ctx.orgSlug} />
                    <input type="hidden" name="recordId" value={m.id} />
                    <input type="hidden" name="jobId" value={jobId} />
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
