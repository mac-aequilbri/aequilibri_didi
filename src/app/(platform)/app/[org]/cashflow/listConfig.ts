// Filter config for the Cashflow ledger — consumed by the page (toPredicate
// over each job's transactions) and the shared FilterBar. Periods are free-ish
// text ("2026-07", "Apr 2026", "Q2 2026"); parsePeriod turns them into dates
// so the period range filter works across all the formats.

import { parsePeriod } from "@/lib/format";
import type { CashflowTxn } from "@/lib/platform/cashflowSource";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const cashflowListConfig: ListViewConfig<CashflowTxn> = {
  search: [(t) => t.name, (t) => t.sourceOrPayee, (t) => t.category, (t) => t.notes],
  fields: [
    {
      kind: "enum",
      name: "type",
      label: "Type",
      options: [
        { value: "In", label: "money in" },
        { value: "Out", label: "money out" },
      ],
    },
    {
      kind: "enum",
      name: "status",
      label: "Status",
      options: ["Forecast", "Confirmed", "Paid", "Overdue"].map((v) => ({ value: v })),
    },
    {
      kind: "daterange",
      name: "period",
      label: "Period",
      getValue: (t) => {
        const ms = parsePeriod(t.period);
        return Number.isNaN(ms) ? null : new Date(ms);
      },
    },
  ],
};
