// Server-rendered SVG charts for the Reporting & Visualisation layer
// (module 8). Pure functions of their data — no client JS, no chart
// dependency; they stream with the RSC payload like any other markup.

// Chart palette — bound to the design-system tokens (globals.css) so charts
// share one colour source of truth; retheming the palette reflows here for
// free. `var()` resolves in SVG fill/stroke presentation attributes in every
// current browser.
//
// SERIES is the categorical hue order (fixed, never cycled). The three hues are
// CVD-validated distinct — worst adjacent ΔE ≈ 31 (protanopia), well above the
// ΔE-12 floor — and every series is always legend-labelled (and, in BarsCompare,
// row-separated with direct value labels), so identity never rests on colour
// alone. Slot 0 is the brand ink, used as the primary/emphasis series.
const SERIES = ["var(--ae-ink)", "var(--ae-space-deep)", "var(--ae-info)"];
const OVER = "var(--ae-danger)"; // over-budget signal (secondary exceeds primary)
const GRID = "var(--ae-earth)"; // recessive gridlines / axis
const LABEL = "var(--ae-muted)"; // all chart text — values, axis ticks, legends
const INK_TEXT = "var(--ae-ink)"; // primary text token (category row labels)

export interface CompareRow {
  label: string;
  primary: number;
  secondary: number;
}

/** Horizontal paired bars — e.g. budget vs actual by category. */
export function BarsCompare({
  rows,
  primaryLabel,
  secondaryLabel,
  formatValue = (n: number) => String(n),
}: {
  rows: CompareRow[];
  primaryLabel: string;
  secondaryLabel: string;
  formatValue?: (n: number) => string;
}) {
  if (!rows.length) return null;
  const max = Math.max(...rows.flatMap((r) => [r.primary, r.secondary]), 1);
  const rowH = 34;
  const labelW = 150;
  const chartW = 380;
  const height = rows.length * rowH + 18;

  return (
    <svg
      viewBox={`0 0 ${labelW + chartW + 8} ${height}`}
      className="w-full max-w-2xl"
      role="img"
      aria-label={`${primaryLabel} vs ${secondaryLabel}`}
    >
      {rows.map((row, i) => {
        const y = i * rowH;
        const w1 = Math.max(2, (row.primary / max) * chartW);
        const w2 = Math.max(2, (row.secondary / max) * chartW);
        return (
          <g key={row.label + i}>
            <text x={labelW - 8} y={y + 15} textAnchor="end" fontSize="11" fill={INK_TEXT}>
              <title>{row.label}</title>
              {row.label.slice(0, 22)}
            </text>
            <rect x={labelW} y={y + 4} width={w1} height={9} rx={2} fill={SERIES[0]} opacity={0.85} />
            <rect
              x={labelW}
              y={y + 16}
              width={w2}
              height={9}
              rx={2}
              fill={row.secondary > row.primary ? OVER : SERIES[1]}
              opacity={0.85}
            />
            <text x={labelW + w1 + 6} y={y + 12} fontSize="9.5" fill={LABEL}>
              {formatValue(row.primary)}
            </text>
            <text x={labelW + w2 + 6} y={y + 24} fontSize="9.5" fill={LABEL}>
              {formatValue(row.secondary)}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${labelW}, ${rows.length * rowH + 12})`} fontSize="9.5">
        <rect x={0} y={-7} width={9} height={9} rx={2} fill={SERIES[0]} opacity={0.85} />
        <text x={13} y={1} fill={LABEL}>{primaryLabel}</text>
        <rect x={90} y={-7} width={9} height={9} rx={2} fill={SERIES[1]} opacity={0.85} />
        <text x={103} y={1} fill={LABEL}>{secondaryLabel}</text>
      </g>
    </svg>
  );
}

export interface TrendSeries {
  name: string;
  color?: string;
  points: { label: string; value: number }[];
}

/** Line chart for trajectories — e.g. rule confidence / accuracy over
 *  snapshots. All series share the x positions of the longest series. */
export function TrendChart({
  series,
  height = 160,
  formatValue = (n: number) => String(Math.round(n)),
}: {
  series: TrendSeries[];
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const usable = series.filter((s) => s.points.length > 0);
  if (!usable.length) return null;
  const palette = SERIES;
  const maxPoints = Math.max(...usable.map((s) => s.points.length));
  // Grow the viewBox with the number of points so a busy series gets breathing
  // room instead of cramming labels; the SVG still scales to fill its card.
  const width = Math.max(520, maxPoints * 46);
  const pad = { top: 12, right: 12, bottom: 26, left: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = usable.flatMap((s) => s.points.map((p) => p.value));
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const span = maxV - minV || 1;
  const x = (i: number) => pad.left + (maxPoints === 1 ? innerW / 2 : (i / (maxPoints - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - minV) / span) * innerH;
  const labels = usable.reduce((best, s) => (s.points.length > best.length ? s.points : best), usable[0].points);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Trend chart">
      {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
        <g key={i}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
          <text x={pad.left - 6} y={y(v) + 3} textAnchor="end" fontSize="9.5" fill={LABEL}>
            {formatValue(v)}
          </text>
        </g>
      ))}
      {labels.map((p, i) =>
        maxPoints <= 12 || i % Math.ceil(maxPoints / 12) === 0 ? (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="9" fill={LABEL}>
            <title>{p.label}</title>
            {p.label.slice(0, 10)}
          </text>
        ) : null,
      )}
      {usable.map((s, si) => {
        const color = s.color ?? palette[si % palette.length];
        const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
        return (
          <g key={s.name}>
            <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
            {s.points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} fill={color} />
            ))}
            <g transform={`translate(${pad.left + si * 150}, ${pad.top - 2})`} fontSize="9.5">
              <rect x={0} y={-7} width={9} height={9} rx={2} fill={color} />
              <text x={13} y={1} fill={LABEL}>{s.name}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
