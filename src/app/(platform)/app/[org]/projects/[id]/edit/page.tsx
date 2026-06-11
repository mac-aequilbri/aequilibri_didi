import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { toNum } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { updateJob } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const job = await prisma.platJob.findFirst({ where: { id: Number(id), orgId: ctx.orgId } });
  if (!job) notFound();

  const dateVal = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <div className="p-6 max-w-xl">
      <PageHeader title={`Edit ${job.code}`} />
      <form action={updateJob} className="ae-card p-5 space-y-4">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <input type="hidden" name="recordId" value={job.id} />
        <label className="block text-sm">
          <span className="text-neutral-600">Name</span>
          <input name="name" defaultValue={job.name} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Status</span>
            <select name="status" defaultValue={job.status} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {["intake", "assessment", "active", "on_hold", "completed", "archived"].map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Completion %</span>
            <input type="number" name="completionPct" min={0} max={100} defaultValue={job.completionPct} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Health score</span>
            <input type="number" name="healthScore" min={0} max={100} defaultValue={job.healthScore} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Budget total $</span>
            <input type="number" step="0.01" name="budgetTotal" defaultValue={toNum(job.budgetTotal)} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Start date</span>
            <input type="date" name="startDate" defaultValue={dateVal(job.startDate)} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Target end</span>
            <input type="date" name="targetEndDate" defaultValue={dateVal(job.targetEndDate)} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Summary</span>
          <textarea name="summary" rows={3} defaultValue={job.summary} className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <button type="submit" className="btn-ae">
          Save changes
        </button>
      </form>
    </div>
  );
}
