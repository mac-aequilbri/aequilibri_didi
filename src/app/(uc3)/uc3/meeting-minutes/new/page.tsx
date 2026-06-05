import { cookies } from "next/headers";
import { prisma as db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { processMeetingMinutes } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

export default async function NewMeetingMinutesPage({
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
    minutes_required: "Please enter the meeting minutes.",
    save_failed: "Failed to save the minutes. Please try again.",
  };

  return (
    <div className="pb-16">
      <PageHeader
        title="New Meeting Minutes"
        subtitle="Record minutes and extract action items with AI"
        actions={[
          { href: "/uc3/meeting-minutes", label: "Back to Minutes", variant: "outline" },
        ]}
      />

      <div className="px-8 max-w-2xl">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorMessages[error] ?? "An error occurred."}
          </div>
        )}

        <div className="ae-card p-6 space-y-5">
          <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800">
            <p className="font-semibold mb-1">AI Processing</p>
            <p>
              After saving, Claude will analyse the raw minutes to extract action items, owners,
              and due dates. Review extracted actions before confirming.
            </p>
          </div>

          <form action={processMeetingMinutes} className="space-y-5">
            {/* Project */}
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

            {/* Meeting Date */}
            <div>
              <label htmlFor="meetingDate" className="block text-sm font-medium text-neutral-700 mb-1">
                Meeting Date <span className="text-red-500">*</span>
              </label>
              <input
                id="meetingDate"
                name="meetingDate"
                type="date"
                required
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-neutral-700 mb-1">
                Title
              </label>
              <input
                id="title"
                name="title"
                type="text"
                placeholder="e.g. Site Coordination Meeting — Week 12"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Attendees */}
            <div>
              <label htmlFor="attendees" className="block text-sm font-medium text-neutral-700 mb-1">
                Attendees
              </label>
              <input
                id="attendees"
                name="attendees"
                type="text"
                placeholder="e.g. John Smith, Sarah Lee, Mark Chen"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-neutral-500">Comma-separated names.</p>
            </div>

            {/* Raw Minutes */}
            <div>
              <label htmlFor="rawMinutes" className="block text-sm font-medium text-neutral-700 mb-1">
                Minutes <span className="text-red-500">*</span>
              </label>
              <textarea
                id="rawMinutes"
                name="rawMinutes"
                rows={12}
                required
                placeholder="Paste or type the meeting minutes here. Include any action items, owners, and due dates mentioned during the meeting…"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="mt-1 text-xs text-neutral-500">
                The more detail you include, the better the AI extraction.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="btn-ae"
                disabled={projects.length === 0}
              >
                Save &amp; Process
              </button>
              <a href="/uc3/meeting-minutes" className="btn-ae-outline">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
