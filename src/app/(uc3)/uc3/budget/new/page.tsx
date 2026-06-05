import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { createBudgetLine } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Uc3BudgetNewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; projectId?: string }>;
}) {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get("uc3_tenant_id")?.value ?? "";
  const sp = await searchParams;
  const error = sp.error;
  const defaultProjectId = sp.projectId ? Number(sp.projectId) : undefined;

  let projects: { id: number; name: string }[] = [];
  let phases: { id: number; name: string; projectId: number | null }[] = [];

  try {
    [projects, phases] = await Promise.all([
      prisma.uc3Project.findMany({
        where: { tenantId: tenantId ? Number(tenantId) : undefined },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.uc3Phase.findMany({
        where: { tenantId: tenantId ? Number(tenantId) : undefined },
        orderBy: { name: "asc" },
        select: { id: true, name: true, projectId: true },
      }),
    ]);
  } catch {
    projects = [];
    phases = [];
  }

  return (
    <div>
      <PageHeader
        title="Add Budget Line"
        subtitle="Create a new estimated vs actual budget entry"
        actions={[{ href: "/uc3/budget", label: "Cancel", variant: "outline" }]}
      />

      <div className="px-8">
        <div className="ae-card p-6 max-w-xl">
          {error === "desc_required" && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-3 py-2">
              Description is required.
            </p>
          )}
          {error === "estimated_required" && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-3 py-2">
              Estimated amount is required and must be a valid number.
            </p>
          )}

          <form action={createBudgetLine} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="projectId" className="text-sm font-medium">
                Project
              </label>
              <select
                id="projectId"
                name="projectId"
                defaultValue={defaultProjectId ?? ""}
                className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              >
                <option value="">— No project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="phaseId" className="text-sm font-medium">
                Phase <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <select
                id="phaseId"
                name="phaseId"
                defaultValue=""
                className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              >
                <option value="">— No phase —</option>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-sm font-medium">
                Description <span className="text-red-500">*</span>
              </label>
              <input
                id="description"
                name="description"
                type="text"
                required
                placeholder="e.g. Framing materials"
                className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="estimated" className="text-sm font-medium">
                Estimated amount (AUD) <span className="text-red-500">*</span>
              </label>
              <input
                id="estimated"
                name="estimated"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="0.00"
                className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-ae">
                Save Budget Line
              </button>
              <a href="/uc3/budget" className="btn-ae-outline">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
