import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadVendors } from "@/lib/platform/vendorsSource";
import { orgPath } from "@/lib/platform/paths";
import { vendorsListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

export default async function VendorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, vendorsListConfig);
  const filtered = hasActiveFilters(query);
  const { items: vendors, total, matching, facets, page, pageCount } = applyListQuery(
    await loadVendors(ctx),
    query,
    vendorsListConfig,
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Vendors"
        subtitle="Contractor and supplier registry."
        actions={[{ href: orgPath(ctx.orgSlug, "/vendors/new"), label: "+ New vendor" }]}
      />
      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/vendors")}
        config={toClientConfig(vendorsListConfig)}
        query={query}
        shown={matching}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search vendors…"
      >
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
                <td className="py-2 pr-2 font-medium">
                  <Link
                    href={orgPath(ctx.orgSlug, `/vendors/${v.id}`)}
                    className="hover:text-[var(--ae-space)] hover:underline"
                  >
                    {v.name}
                  </Link>
                </td>
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
                    title={filtered ? "No vendors match these filters" : "No vendors yet"}
                    hint={
                      filtered
                        ? "Try widening or clearing the filters above."
                        : "Keep subcontractors and suppliers — with ratings and contacts — here."
                    }
                    action={{ href: orgPath(ctx.orgSlug, "/vendors/new"), label: "+ New vendor" }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </FilterBar>
    </div>
  );
}
