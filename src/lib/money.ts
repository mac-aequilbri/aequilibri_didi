// Monetary helpers. The Django app used Python's round() (banker's rounding)
// on floats for pricing; values in the rate table are clean enough that
// round-half-up matches in every validated worksheet. We keep a single
// round2() so all currency math rounds consistently to 2 dp.

export const GST_RATE = 0.1;

/** Round to 2 decimal places (currency). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Round to `places` decimal places. */
export function roundTo(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** GST component (10%) of an ex-GST amount. */
export function gst(exGst: number): number {
  return round2(exGst * GST_RATE);
}

/** Total including GST. */
export function incGst(exGst: number): number {
  return round2(exGst + gst(exGst));
}
