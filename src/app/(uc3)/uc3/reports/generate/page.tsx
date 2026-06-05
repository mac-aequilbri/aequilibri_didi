import { cookies } from "next/headers";
import { prisma as db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { generateWeeklyReport } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

export default async function GenerateReportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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

  const errorMessages: Record<string, string> = {
    project_required: "Please select a project.",
    week_required: "Please enter a week ending date.",
    generation_failed: "AI report generation failed. Please try again.",
  };

  return (
    <div className="pb-16">
      <PageHeader
        title="Generate Weekly Report"
        subtitle="Use AI to draft a weekly project status report"
        actions={[{ href: "/uc3/reports", label: "← Back to Reports" }]}
      />

      <div className="px-8 max-w-xl">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorMessages[error] ?? "An error occurred."}
          </div>
        )}

        <div className="ae-card p-6 space-y-5">
          <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800">
            <p className="font-semibold mb-1">✦ AI Generation</p>
            <p>
              Claude will analyse the project&apos;s phases, action items, risks, and budget to
              draft a concise weekly status report. Review and approve the draft before sending.
            </p>
          </div>

          <form action={generateWeeklyReport} className="space-y-5">
            <div>
              <label htmlFor="projectId" className="block text-sm font-medium text-neutral-700 mb-1">
                Project <span className="text-red-500">*</span>
              </label>
              {projects.length === 0 ? (
                <p className="text-sm text-neutral-500">No projects found.</p>
              ) : (
                <select
                  id="projectId"
                  name="projectId"
                  required
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label htmlFor="weekEnding" className="block text-sm font-medium text-neutral-700 mb-1">
                Week Ending <span className="text-red-500">*</span>
              </label>
              <input
                id="weekEnding"
                name="weekEnding"
                type="date"
                required
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-neutral-500">Typically a Friday date.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="btn-ae"
                disabled={projects.length === 0}
              >
                ✦ Generate Report
              </button>
              <a href="/uc3/reports" className="btn-ae-outline">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
