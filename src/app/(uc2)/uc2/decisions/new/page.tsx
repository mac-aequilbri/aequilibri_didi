import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { createDecision } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewDecisionPage() {
  let categories: { id: number; name: string }[] = [];

  try {
    categories = await prisma.uc2RefCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch {
    // proceed with empty list
  }

  async function handleSubmit(formData: FormData) {
    "use server";
    await createDecision(formData);
    redirect("/uc2/decisions");
  }

  return (
    <div>
      <PageHeader
        title="New Decision"
        subtitle="Record a project decision"
        actions={[{ href: "/uc2/decisions", label: "Back to Decisions", variant: "outline" }]}
      />
      <div className="px-8 pb-10">
        <div className="ae-card p-6 max-w-2xl">
          <form action={handleSubmit} className="space-y-5">
            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                rows={3}
                required
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ae-primary"
                placeholder="Describe the decision…"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
              <select
                name="categoryId"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ae-primary"
              >
                <option value="">— select category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Made By */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Made By</label>
              <input
                name="madeBy"
                type="text"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ae-primary"
                placeholder="Person or group"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Date</label>
              <input
                name="date"
                type="date"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ae-primary"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Status</label>
              <select
                name="status"
                defaultValue="draft"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ae-primary"
              >
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="superseded">Superseded</option>
              </select>
            </div>

            {/* Rationale */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Rationale</label>
              <textarea
                name="rationale"
                rows={3}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ae-primary"
                placeholder="Why was this decision made?"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-ae">
                Save Decision
              </button>
              <a href="/uc2/decisions" className="btn-ae-outline">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
