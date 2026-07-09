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

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  MONTH_ABBR.map((m, i) => [m.toLowerCase(), i]),
);

/**
 * Turn a free-text period label into a sortable UTC timestamp so periods
 * order chronologically rather than alphabetically. Handles "April 2025",
 * "Apr 2025", ISO "2025-04"/"2025-04-01", quarters "Q2 2025", and bare years.
 * Returns NaN for anything unparseable (callers should sort those last).
 */
export function parsePeriod(period: string): number {
  const s = period.trim().toLowerCase();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, iso[3] ? +iso[3] : 1);
  const monthYear = s.match(/([a-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (monthYear && monthYear[1] in MONTH_INDEX) return Date.UTC(+monthYear[2], MONTH_INDEX[monthYear[1]], 1);
  const quarter = s.match(/q([1-4])\s*[-\s]?\s*(\d{4})/);
  if (quarter) return Date.UTC(+quarter[2], (+quarter[1] - 1) * 3, 1);
  const year = s.match(/^(\d{4})$/);
  if (year) return Date.UTC(+year[1], 0, 1);
  return NaN;
}

/** Comparator for period labels — chronological, unparseable values last. */
export function comparePeriods(a: string, b: string): number {
  const ta = parsePeriod(a);
  const tb = parsePeriod(b);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return a.localeCompare(b);
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}

/** Compact axis label for a period, e.g. "April 2025" -> "Apr '25". */
export function formatPeriodLabel(period: string): string {
  const t = parsePeriod(period);
  if (Number.isNaN(t)) return period;
  const d = new Date(t);
  return `${MONTH_ABBR[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}
