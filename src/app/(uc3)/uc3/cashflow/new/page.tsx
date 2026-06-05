import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { createCashflowEntry } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Uc3CashflowNewPage({
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

  try {
    projects = await prisma.uc3Project.findMany({
      where: { tenantId: tenantId ? Number(tenantId) : undefined },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch {
    projects = [];
  }

  // Default period to current month
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader
        title="Add Cashflow Entry"
        subtitle="Record a projected cashflow amount for a project period"
        actions={[{ href: "/uc3/cashflow", label: "Cancel", variant: "outline" }]}
      />

      <div className="px-8">
        <div className="ae-card p-6 max-w-xl">
          {error === "period_required" && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-3 py-2">
              Period is required and must be in YYYY-MM format.
            </p>
          )}
          {error === "projected_required" && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-3 py-2">
              Projected amount is required and must be a valid number.
            </p>
          )}

          <form action={createCashflowEntry} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="projectId" className="text-sm font-medium">
                Project <span className="text-neutral-400 font-normal">(optional)</span>
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
              <label htmlFor="period" className="text-sm font-medium">
                Period <span className="text-red-500">*</span>
              </label>
              <input
                id="period"
                name="period"
                type="month"
                defaultValue={defaultPeriod}
                required
                className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              />
              <p className="text-xs text-neutral-400">Format: YYYY-MM (e.g. 2025-07)</p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="projected" className="text-sm font-medium">
                Projected amount (AUD) <span className="text-red-500">*</span>
              </label>
              <input
                id="projected"
                name="projected"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="0.00"
                className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              />
              <p className="text-xs text-neutral-400">
                Actual figures can be entered from the cashflow list once the period closes.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-ae">
                Save Entry
              </button>
              <a href="/uc3/cashflow" className="btn-ae-outline">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
