import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { addBimModel } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function NewBimModelPage({
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

  return (
    <div className="p-6 max-w-xl">
      <PageHeader
        title="Add 3D model"
        subtitle={`Attach a BIMx hyper-model to ${job.name}`}
        actions={[{ href: orgPath(ctx.orgSlug, `/projects/${jobId}/models`), label: "Back", variant: "outline" }]}
      />
      {error === "invalid_url" && (
        <p className="text-red-600 text-sm mb-3">
          That embed link was rejected — only HTTPS graphisoft.com share/embed links are allowed.
        </p>
      )}
      {error === "name_required" && <p className="text-red-600 text-sm mb-3">A model name is required.</p>}
      <form action={addBimModel} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <input type="hidden" name="jobId" value={jobId} />
        <label className="block text-sm">
          <span className="text-neutral-600">Model name *</span>
          <input name="name" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">BIMx share / embed link *</span>
          <input
            name="embedUrl"
            required
            placeholder="https://bimx.graphisoft.com/…  (or paste the full <iframe> snippet)"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
          <span className="block mt-1 text-xs text-neutral-500">
            Upload your hyper-model at bimx.graphisoft.com, then copy the share link or the embed
            snippet here. Only graphisoft.com links are accepted.
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Notes</span>
          <textarea name="notes" rows={2} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="clientVisible" />
          <span>Visible in the client portal</span>
        </label>
        <button type="submit" className="btn-ae">
          Add model
        </button>
      </form>
    </div>
  );
}
