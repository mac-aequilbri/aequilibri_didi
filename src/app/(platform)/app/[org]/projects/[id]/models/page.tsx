import { notFound } from "next/navigation";
import { BimxViewer } from "@/components/BimxViewer";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { loadJobBimModels } from "@/lib/platform/bimModelsSource";
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
  const data = await loadJobBimModels(ctx, id);
  if (!data) notFound();
  const { job, models } = data;
  const jobId = job.id;
  const p = (path: string) => orgPath(ctx.orgSlug, path);

  return (
    <div className="pb-16">
      <PageHeader
        title="3D Model & Interior Walkthrough"
        subtitle={`Explorable 3D model — floor plan, interiors and fixtures — for ${job.name}`}
        actions={[
          { href: p(`/projects/${jobId}/models/new`), label: "Add 3D Model" },
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
          <div className="ae-card p-8 text-sm text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto">
            <p className="font-medium text-neutral-800 dark:text-neutral-100 mb-3">
              No 3D model attached yet
            </p>
            <p className="mb-3">
              Give this new build an interactive 3D model the client can walk through —
              floor plan, rooms, interior fixtures and finishes, all explorable in the browser.
            </p>
            <ol className="list-decimal list-inside space-y-1 text-neutral-500">
              <li>Design the home in Archicad with its interiors and fixtures.</li>
              <li>
                Publish a BIMx hyper-model (<span className="font-medium">File → Publish → BIMx Hyper-model</span>)
                and upload it to the BIMx Model Transfer site (bimx.graphisoft.com).
              </li>
              <li>Copy its share or embed link.</li>
              <li>
                Click <span className="font-medium">Add 3D Model</span> and paste the link.
              </li>
            </ol>
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
