import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getTenantId } from "@/lib/uc3-tenant";
import { prisma as db } from "@/lib/db";
import { createDecision, aiDraftDecision } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewDecisionPage() {
  const tenantId = await getTenantId();

  if (!tenantId) {
    return (
      <div className="px-8 py-16 text-neutral-500 text-sm">
        No tenant selected.{" "}
        <Link href="/uc3/select-tenant" className="text-blue-600 underline">
          Select one
        </Link>
        .
      </div>
    );
  }

  let projects: { id: number; name: string }[] = [];
  try {
    projects = await db.uc3Project.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch {
    // graceful empty state
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="New Decision"
        subtitle="Record a project decision, or have AI draft one for review"
        actions={[{ href: "/uc3/decisions", label: "Back to Decisions", variant: "outline" }]}
      />

      <div className="px-8 grid gap-6 lg:grid-cols-2">
        {/* Manual decision */}
        <div className="ae-card p-6">
          <h2 className="text-base font-semibold mb-4">Record a decision</h2>
          <form action={createDecision} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Project</label>
              <select name="projectId" className="ae-input w-full">
                <option value="">— Select project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Decision <span className="text-red-500">*</span>
              </label>
              <textarea name="description" rows={3} required placeholder="State the decision…" className="ae-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Rationale</label>
              <textarea name="rationale" rows={3} placeholder="Why this decision was made…" className="ae-input w-full" />
            </div>
            <button type="submit" className="btn-ae">Save Decision</button>
          </form>
        </div>

        {/* AI-drafted decision */}
        <div className="ae-card p-6">
          <h2 className="text-base font-semibold mb-4">
            AI-draft a decision
            <span className="ml-2 inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
              Review required
            </span>
          </h2>
          <form action={aiDraftDecision} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Project</label>
              <select name="projectId" className="ae-input w-full">
                <option value="">— Select project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Situation / prompt <span className="text-red-500">*</span>
              </label>
              <textarea
                name="prompt"
                rows={4}
                required
                placeholder="Describe the situation requiring a decision; AI will draft a statement + rationale for your review."
                className="ae-input w-full"
              />
            </div>
            <button type="submit" className="btn-ae-outline">Draft with AI</button>
          </form>
        </div>
      </div>
    </div>
  );
}
