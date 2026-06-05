import { cookies } from "next/headers";
import { prisma as db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { createDocument } from "@/app/(uc3)/uc3/actions";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
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

  return (
    <div className="pb-16">
      <PageHeader
        title="Upload Document"
        subtitle="Add a new document to the project library"
        actions={[{ href: "/uc3/documents", label: "Back to Documents", variant: "outline" }]}
      />

      <div className="px-8">
        <div className="ae-card p-6 max-w-2xl">
          {error === "name_required" && (
            <p className="text-red-600 text-sm mb-4">Document name is required.</p>
          )}

          <form action={createDocument} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Document Name <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                type="text"
                required
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Site Survey Report v2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Project
              </label>
              <select
                name="projectId"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Document Type
              </label>
              <input
                name="docType"
                type="text"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Contract, Drawing, Report, Invoice"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Version
              </label>
              <input
                name="version"
                type="text"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 1.0, Rev A"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Uploaded By
              </label>
              <input
                name="uploadedBy"
                type="text"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Jane Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                rows={2}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional notes about this document"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                File Content
              </label>
              <textarea
                name="fileContent"
                rows={8}
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paste document text content here (for AI analysis)"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-ae">
                Save Document
              </button>
              <a href="/uc3/documents" className="btn-ae-outline">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
