import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
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
  const { items: orders, total, facets } = applyListQuery(
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
        shown={orders.length}
        total={total}
        counts={facets}
        searchPlaceholder="Search orders…"
      >
      <div className="ae-card p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Item</th>
              <th className="py-1 pr-2">Vendor</th>
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1 pr-2 text-right">Total</th>
              <th className="py-1 pr-2">Due</th>
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
                <td className="py-2 pr-2 whitespace-nowrap text-xs">
                  {o.dueDate ? formatDate(o.dueDate) : "—"}
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
                <td className="py-4 text-neutral-500" colSpan={6}>
                  {filtered ? "No orders match these filters." : "No orders yet."}
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
