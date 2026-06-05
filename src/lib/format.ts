import type { Decimal } from "@prisma/client/runtime/library";

type Num = number | string | Decimal | null | undefined;

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Coerce a Prisma Decimal / string / number to a JS number. */
export function toNum(v: Num): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}

/** Format an amount as AUD currency, e.g. $1,234.50. */
export function currency(v: Num): string {
  return AUD.format(toNum(v));
}

/** Format a date as e.g. "30 May 2026". */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
