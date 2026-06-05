import { cookies } from "next/headers";
import Link from "next/link";
import { prisma as db } from "@/lib/db";
import type { Uc3Vendor } from "@prisma/client";
import { PageHeader, MetricCard } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

function ratingColor(rating: number | null): string {
  if (rating === null) return "text-neutral-400";
  if (rating >= 8) return "text-emerald-600 font-semibold";
  if (rating >= 5) return "text-yellow-600 font-semibold";
  return "text-red-600 font-semibold";
}

function ratingBar(rating: number | null) {
  if (rating === null) return null;
  const pct = (rating / 10) * 100;
  const color = rating >= 8 ? "bg-emerald-500" : rating >= 5 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-neutral-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={ratingColor(rating)}>{rating}/10</span>
    </div>
  );
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ active?: string }>;
}) {
  const sp = await searchParams;
  const activeFilter = sp.active; // "true" | "false" | undefined

  let vendors: Uc3Vendor[] = [];

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
      const where: NonNullable<Parameters<typeof db.uc3Vendor.findMany>[0]>["where"] = { tenantId };
      if (activeFilter === "true") where.isActive = true;
      else if (activeFilter === "false") where.isActive = false;

      vendors = await db.uc3Vendor.findMany({
        where,
        orderBy: { name: "asc" },
      });
    }
  } catch {
    // graceful empty state
  }

  const total = vendors.length;
  const active = vendors.filter((v) => v.isActive).length;
  const avgRating =
    vendors.filter((v) => v.rating !== null).length > 0
      ? (
          vendors.reduce((sum, v) => sum + (v.rating ?? 0), 0) /
          vendors.filter((v) => v.rating !== null).length
        ).toFixed(1)
      : "—";

  return (
    <div className="pb-16">
      <PageHeader
        title="Vendors"
        subtitle="Manage your supplier and subcontractor directory"
        actions={[{ href: "/uc3/vendors/new", label: "+ New Vendor" }]}
      />

      <div className="px-8 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetricCard value={total} label="Total Vendors" />
          <MetricCard value={active} label="Active" />
          <MetricCard value={avgRating} label="Avg Rating" />
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 text-sm">
          <Link
            href="/uc3/vendors"
            className={`px-3 py-1 rounded-full border ${!activeFilter ? "bg-neutral-800 text-white border-neutral-800" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}
          >
            All
          </Link>
          <Link
            href="/uc3/vendors?active=true"
            className={`px-3 py-1 rounded-full border ${activeFilter === "true" ? "bg-neutral-800 text-white border-neutral-800" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}
          >
            Active
          </Link>
          <Link
            href="/uc3/vendors?active=false"
            className={`px-3 py-1 rounded-full border ${activeFilter === "false" ? "bg-neutral-800 text-white border-neutral-800" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}
          >
            Inactive
          </Link>
        </div>

        {/* Table */}
        <div className="ae-card overflow-hidden">
          {vendors.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              No vendors found.{" "}
              <Link href="/uc3/vendors/new" className="text-blue-600 underline">
                Add the first one.
              </Link>
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <td className="font-medium">{v.name}</td>
                    <td>{v.category ?? "—"}</td>
                    <td>{v.contactName ?? "—"}</td>
                    <td>
                      {v.contactEmail ? (
                        <a
                          href={`mailto:${v.contactEmail}`}
                          className="text-blue-600 hover:underline"
                        >
                          {v.contactEmail}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{v.contactPhone ?? "—"}</td>
                    <td>{ratingBar(v.rating)}</td>
                    <td>
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${v.isActive ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}
                      >
                        {v.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/uc3/vendors/${v.id}/edit`}
                        className="text-blue-600 text-sm hover:underline whitespace-nowrap"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
