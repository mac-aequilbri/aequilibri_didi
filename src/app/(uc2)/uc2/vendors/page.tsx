import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  let vendors: Awaited<ReturnType<typeof prisma.uc2Vendor.findMany>> = [];

  try {
    vendors = await prisma.uc2Vendor.findMany({
      orderBy: { name: "asc" },
    });
  } catch {
    // empty state on error
  }

  function ratingColor(rating: number): string {
    if (rating >= 8) return "text-green-700 font-semibold";
    if (rating >= 5) return "text-amber-600 font-semibold";
    return "text-red-600 font-semibold";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        subtitle="Dulong Downs — registered contractors and suppliers (read-only)"
      />

      {vendors.length === 0 ? (
        <div className="ae-card text-center py-12 text-neutral-500">
          No vendors found.
        </div>
      ) : (
        <div className="ae-card overflow-x-auto">
          <table className="ae-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="text-center">Rating</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => {
                const rating = vendor.rating != null ? Number(vendor.rating) : null;
                return (
                  <tr key={vendor.id}>
                    <td className="font-medium">
                      {vendor.name}
                      {vendor.notes && (
                        <span
                          className="block text-xs text-neutral-400 font-normal truncate max-w-xs"
                          title={vendor.notes}
                        >
                          {vendor.notes}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="text-sm bg-neutral-100 px-2 py-0.5 rounded">
                        {vendor.category}
                      </span>
                    </td>
                    <td className="text-sm">
                      {vendor.contact ?? <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="text-sm">
                      {vendor.email ? (
                        <a
                          href={`mailto:${vendor.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {vendor.email}
                        </a>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="text-sm whitespace-nowrap">
                      {vendor.phone ?? <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="text-center">
                      {rating !== null ? (
                        <span className={ratingColor(rating)}>
                          {rating.toFixed(1)}
                          <span className="text-xs font-normal text-neutral-400">/10</span>
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      {vendor.isActive ? (
                        <StatusBadge status="active" />
                      ) : (
                        <span className="status-badge bg-neutral-100 text-neutral-500">
                          inactive
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-neutral-400 px-1">
        This page is read-only. Vendor records are managed via the Didi chat interface or direct database operations.
      </p>
    </div>
  );
}
