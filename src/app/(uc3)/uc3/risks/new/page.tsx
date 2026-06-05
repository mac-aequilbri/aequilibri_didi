import { cookies } from "next/headers";
import { prisma as db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { createRisk } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewRiskPage() {
  let projects: { id: number; name: string }[] = [];

  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;
    let tenantId: number | null = val ? Number(val) : null;
    if (!tenantId) {
      const fallback = await db.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }
    if (tenantId) {
      projects = await db.uc3Project.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
    }
  } catch {
    // graceful empty state
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="New Risk"
        subtitle="Add a risk to the register"
        actions={[{ href: "/uc3/risks", label: "Back to Risks", variant: "outline" }]}
      />

      <div className="px-8">
        <div className="ae-card p-6 max-w-2xl">
          <form action={createRisk} className="space-y-5">
            {/* Project */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Project
              </label>
              <select name="projectId" className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— No project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                rows={3}
                required
                placeholder="Describe the risk…"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Owner */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Owner
              </label>
              <input
                type="text"
                name="owner"
                placeholder="Responsible person"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Likelihood & Impact */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Likelihood <span className="text-red-500">*</span>
                </label>
                <select
                  name="likelihood"
                  required
                  defaultValue="3"
                  className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1">1 — Very Low</option>
                  <option value="2">2 — Low</option>
                  <option value="3">3 — Medium</option>
                  <option value="4">4 — High</option>
                  <option value="5">5 — Very High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Impact <span className="text-red-500">*</span>
                </label>
                <select
                  name="impact"
                  required
                  defaultValue="3"
                  className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1">1 — Very Low</option>
                  <option value="2">2 — Low</option>
                  <option value="3">3 — Medium</option>
                  <option value="4">4 — High</option>
                  <option value="5">5 — Very High</option>
                </select>
              </div>
            </div>

            {/* Mitigation */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Mitigation
              </label>
              <textarea
                name="mitigation"
                rows={3}
                placeholder="Describe mitigation strategy…"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" className="btn-ae">
                Save Risk
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
