import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate, toNum } from "@/lib/format";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadProcurement } from "@/lib/platform/procurementSource";
import { orgPath } from "@/lib/platform/paths";
import { setProcurementStatus } from "./actions";
import { procurementListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "ordered", "delivered", "invoiced", "paid"];

export default async function ProcurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, procurementListConfig);
  const filtered = hasActiveFilters(query);
  const { items: orders, total, matching, facets, page, pageCount } = applyListQuery(
    await loadProcurement(ctx),
    query,
    procurementListConfig,
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Procurement"
        subtitle="Orders tracked from pending through to paid."
        actions={[{ href: orgPath(ctx.orgSlug, "/procurement/new"), label: "+ New order" }]}
      />
      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/procurement")}
        config={toClientConfig(procurementListConfig)}
        query={query}
        shown={matching}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search orders…"
      >
      <div className="ae-card p-5 overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Item</th>
              <th className="py-1 pr-2">Vendor</th>
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1 pr-2 text-right">Total</th>
              <th className="py-1 pr-2">Expected</th>
              <th className="py-1 pr-2">Actual</th>
              <th className="py-1 pr-2 text-right">Δ days</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="py-2 pr-2">
                  <Link
                    href={orgPath(ctx.orgSlug, `/procurement/${o.id}`)}
                    className="font-medium hover:text-[var(--ae-space)] hover:underline"
                  >
                    {o.item}
                  </Link>
                  <span className="ml-1 text-xs text-neutral-400">{o.jobCode}</span>
                </td>
                <td className="py-2 pr-2 text-xs">{o.vendorName || "—"}</td>
                <td className="py-2 pr-2 text-right text-xs">{o.qty}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{currency(toNum(o.total))}</td>
                <td
                  className={`py-2 pr-2 whitespace-nowrap text-xs ${o.isLate ? "text-red-600 font-medium" : ""}`}
                  title={o.isLate ? "Overdue — past expected delivery, not yet received" : undefined}
                >
                  {o.dueDate ? formatDate(o.dueDate) : "—"}
                  {o.isLate && <span className="ml-1" aria-label="overdue">⚠</span>}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-xs">
                  {o.actualDate ? formatDate(o.actualDate) : "—"}
                </td>
                <td
                  className={`py-2 pr-2 text-right whitespace-nowrap text-xs tabular-nums ${
                    o.deltaDays != null && o.deltaDays > 0 ? "text-red-600 font-medium" : o.deltaDays != null && o.deltaDays < 0 ? "text-emerald-700" : "text-neutral-400"
                  }`}
                  title="Delivery delta: actual − expected (positive = late)"
                >
                  {o.deltaDays == null ? "—" : o.deltaDays > 0 ? `+${o.deltaDays}` : o.deltaDays}
                </td>
                <td className="py-2 whitespace-nowrap">
                  <form action={setProcurementStatus} className="flex items-center gap-1">
                    <input type="hidden" name="org" value={ctx.orgSlug} />
                    <input type="hidden" name="recordId" value={o.id} />
                    <StatusBadge status={o.status} />
                    <select name="status" defaultValue={o.status} className="text-xs border border-neutral-200 rounded px-1 py-0.5">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-ae-outline text-xs">
                      Set
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6">
                  <EmptyState
                    title={filtered ? "No orders match these filters" : "No orders yet"}
                    hint={
                      filtered
                        ? "Try widening or clearing the filters above."
                        : "Track each order from pending through delivered, invoiced and paid."
                    }
                    action={{ href: orgPath(ctx.orgSlug, "/procurement/new"), label: "+ New order" }}
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
