// Decimal-safe money arithmetic for the platform. Prisma returns Decimal for
// money columns; JS float math on those values accumulates rounding error —
// any amount that is COMPUTED (totals, scaling, variance) goes through these
// helpers and is rounded to cents exactly once, at the end.

import Decimal from "decimal.js";

type MoneyLike = Decimal | number | string | { toString(): string } | null | undefined;

function dec(v: MoneyLike): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  try {
    return new Decimal(typeof v === "object" ? v.toString() : v);
  } catch {
    return new Decimal(0);
  }
}

/** Sum to a number rounded to cents. */
export function sumMoney(values: MoneyLike[]): number {
  return values
    .reduce((acc: Decimal, v) => acc.plus(dec(v)), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();
}

/** Multiply (e.g. qty × unit price, or scale a breakdown line), to cents. */
export function mulMoney(a: MoneyLike, b: MoneyLike): number {
  return dec(a).times(dec(b)).toDecimalPlaces(2).toNumber();
}

/** Variance of actual vs budget as a signed percentage with one decimal
 *  place; 0 when the budget is zero. */
export function variancePct(budget: MoneyLike, actual: MoneyLike): number {
  const b = dec(budget);
  if (b.isZero()) return 0;
  return dec(actual).minus(b).div(b).times(100).toDecimalPlaces(1).toNumber();
}
