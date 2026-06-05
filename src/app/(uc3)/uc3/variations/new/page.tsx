import { PageHeader } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import Link from "next/link";
import { createVariationOrder, aiDraftVariation } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewVariationPage() {
  const tenantId = await getTenantId();

  let projects: { id: number; name: string }[] = [];
  if (tenantId) {
    try {
      projects = await db.uc3Project.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
    } catch {
      // empty state on error
    }
  }

  return (
    <div>
      <PageHeader title="New Variation Order" subtitle="Record a scope or cost change" />

      <div className="px-8 pb-8 max-w-2xl">
        <div className="ae-card p-6">
          <form className="flex flex-col gap-5">
            {/* Project */}
            <div className="flex flex-col gap-1">
              <label htmlFor="projectId" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Project <span className="text-red-500">*</span>
              </label>
              <select id="projectId" name="projectId" required className="ae-input">
                <option value="">— Select project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1">
              <label htmlFor="title" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="e.g. Additional earthworks at grid A5"
                className="ae-input"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Describe the variation in detail…"
                className="ae-input resize-none"
              />
            </div>

            {/* Scope Change */}
            <div className="flex flex-col gap-1">
              <label htmlFor="scopeChange" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Scope Change Detail
              </label>
              <textarea
                id="scopeChange"
                name="scopeChange"
                rows={3}
                placeholder="Explain what is being added, removed, or modified in scope…"
                className="ae-input resize-none"
              />
            </div>

            {/* Cost Impact + Time Impact */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="costImpact" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Cost Impact ($)
                </label>
                <input
                  id="costImpact"
                  name="costImpact"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="ae-input"
                />
                <p className="text-xs text-neutral-400">Positive = increase, negative = saving</p>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="timeImpactDays" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Time Impact (days)
                </label>
                <input
                  id="timeImpactDays"
                  name="timeImpactDays"
                  type="number"
                  step="1"
                  placeholder="0"
                  className="ae-input"
                />
              </div>
            </div>

            {/* Submitted By */}
            <div className="flex flex-col gap-1">
              <label htmlFor="submittedBy" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Submitted By
              </label>
              <input
                id="submittedBy"
                name="submittedBy"
                type="text"
                placeholder="e.g. John Smith"
                className="ae-input"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button formAction={createVariationOrder} type="submit" className="btn-ae">
                Save as Draft
              </button>
              <button formAction={aiDraftVariation} type="submit" className="btn-ae-outline">
                ✦ AI Draft
              </button>
              <Link href="/uc3/variations" className="btn-ae-outline">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
