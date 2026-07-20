// Per-job transaction ledger. Rows arrive already sorted chronologically by
// period (see cashflowSource); this component just paginates so a job with
// dozens of entries doesn't render as one unbroken wall of rows.
"use client";

import { useState } from "react";
import Link from "next/link";
import { comparePeriods, currency } from "@/lib/format";
import type { CashflowTxn } from "@/lib/platform/cashflowSource";
import { orgPath } from "@/lib/platform/paths";

const PAGE_SIZE = 12;

// Legacy Postgres rows carry synthetic split ids ("<id>-f"/"-a") that map to no
// editable record — only real ids (Airtable rec…, plain Postgres numerics) link.
const isEditable = (id: string) => !id.includes("-");

export function CashflowLedger({ txns, orgSlug }: { txns: CashflowTxn[]; orgSlug: string }) {
  const rows = [...txns].sort((a, b) => comparePeriods(a.period, b.period));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const shown = rows.slice(start, start + PAGE_SIZE);

  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-500">
          <tr>
            <th className="py-1 pr-2">Period</th>
            <th className="py-1 pr-2">Entry</th>
            <th className="py-1 pr-2">Type</th>
            <th className="py-1 pr-2 text-right">Amount</th>
            <th className="py-1 pr-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.id} className="border-t border-neutral-100">
              <td className="py-2 pr-2 font-medium whitespace-nowrap">{c.period || "—"}</td>
              <td className="py-2 pr-2">
                {isEditable(c.id) ? (
                  <Link
                    href={orgPath(orgSlug, `/cashflow/${c.id}`)}
                    className="font-medium hover:text-[var(--ae-space)] hover:underline"
                  >
                    {c.name || c.sourceOrPayee || "(entry)"}
                  </Link>
                ) : (
                  <span className="font-medium">{c.name || c.sourceOrPayee || "(entry)"}</span>
                )}
                {(c.sourceOrPayee || c.category || c.notes) && (
                  <span className="block text-xs text-neutral-500">
                    {[c.sourceOrPayee, c.category, c.notes].filter(Boolean).join(" · ")}
                  </span>
                )}
              </td>
              <td className={`py-2 pr-2 text-xs font-semibold ${c.type === "In" ? "text-emerald-700" : "text-neutral-600"}`}>
                {c.type}
              </td>
              <td
                className={`py-2 pr-2 text-right whitespace-nowrap tabular-nums ${c.type === "Out" ? "text-red-700" : "text-emerald-700"}`}
              >
                {c.type === "Out" ? `-${currency(c.amount)}` : currency(c.amount)}
              </td>
              <td className="py-2 pr-2 text-right text-xs whitespace-nowrap">{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {pageCount > 1 && (
        <div className="filter-pager">
          <span>
            {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <button
            type="button"
            className="btn-ae-outline text-xs disabled:opacity-40"
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
          >
            ← Prev
          </button>
          <span className="tabular-nums">
            Page {current + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="btn-ae-outline text-xs disabled:opacity-40"
            onClick={() => setPage(current + 1)}
            disabled={current >= pageCount - 1}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}
