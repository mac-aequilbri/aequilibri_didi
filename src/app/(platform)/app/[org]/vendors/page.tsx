import { EmptyState, PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadVendors } from "@/lib/platform/vendorsSource";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function VendorsPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const vendors = await loadVendors(ctx);

  return (
    <div className="p-6">
      <PageHeader
        title="Vendors"
        subtitle="Contractor and supplier registry."
        actions={[{ href: orgPath(ctx.orgSlug, "/vendors/new"), label: "+ New vendor" }]}
      />
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Vendor</th>
              <th className="py-1 pr-2">Category</th>
              <th className="py-1 pr-2">Contact</th>
              <th className="py-1 pr-2">Rating</th>
              <th className="py-1">Active</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} className="border-t border-neutral-100">
                <td className="py-2 pr-2 font-medium">{v.name}</td>
                <td className="py-2 pr-2 text-xs">{v.category || "—"}</td>
                <td className="py-2 pr-2 text-xs">
                  {v.contactName || "—"}
                  {v.contactEmail && (
                    <span className="block text-neutral-500">{v.contactEmail}</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-xs whitespace-nowrap">
                  {"★".repeat(Math.round(v.rating / 2)) || "—"}{" "}
                  <span className="text-neutral-400">{v.rating}/10</span>
                </td>
                <td className="py-2 text-xs">{v.isActive ? "Yes" : "No"}</td>
              </tr>
            ))}
            {vendors.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6">
                  <EmptyState
                    title="No vendors yet"
                    hint="Keep subcontractors and suppliers — with ratings and contacts — here."
                    action={{ href: orgPath(ctx.orgSlug, "/vendors/new"), label: "+ New vendor" }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
