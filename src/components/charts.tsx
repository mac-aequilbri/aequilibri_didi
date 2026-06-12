// Server-rendered SVG charts for the Reporting & Visualisation layer
// (module 8). Pure functions of their data — no client JS, no chart
// dependency; they stream with the RSC payload like any other markup.

const INK = "#1f2937"; // var(--ae-space) resolved — SVG-safe
const ACCENT = "#d97706";
const MUTED = "#e5e7eb";

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
            <text x={labelW - 8} y={y + 15} textAnchor="end" fontSize="11" fill={INK}>
              {row.label.slice(0, 22)}
            </text>
            <rect x={labelW} y={y + 4} width={w1} height={9} rx={2} fill={INK} opacity={0.85} />
            <rect x={labelW} y={y + 16} width={w2} height={9} rx={2} fill={ACCENT} opacity={0.85} />
            <text x={labelW + Math.max(w1, w2) + 6} y={y + 17} fontSize="9.5" fill="#737373">
              {formatValue(row.secondary)}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${labelW}, ${rows.length * rowH + 12})`} fontSize="9.5">
        <rect x={0} y={-7} width={9} height={9} rx={2} fill={INK} opacity={0.85} />
        <text x={13} y={1} fill="#737373">{primaryLabel}</text>
        <rect x={90} y={-7} width={9} height={9} rx={2} fill={ACCENT} opacity={0.85} />
        <text x={103} y={1} fill="#737373">{secondaryLabel}</text>
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
  const palette = [INK, ACCENT, "#0e7490"];
  const width = 520;
  const pad = { top: 12, right: 12, bottom: 26, left: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxPoints = Math.max(...usable.map((s) => s.points.length));
  const values = usable.flatMap((s) => s.points.map((p) => p.value));
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const span = maxV - minV || 1;
  const x = (i: number) => pad.left + (maxPoints === 1 ? innerW / 2 : (i / (maxPoints - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - minV) / span) * innerH;
  const labels = usable.reduce((best, s) => (s.points.length > best.length ? s.points : best), usable[0].points);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl" role="img" aria-label="Trend chart">
      {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
        <g key={i}>
          <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={MUTED} strokeWidth={1} />
          <text x={pad.left - 6} y={y(v) + 3} textAnchor="end" fontSize="9.5" fill="#737373">
            {formatValue(v)}
          </text>
        </g>
      ))}
      {labels.map((p, i) =>
        maxPoints <= 12 || i % Math.ceil(maxPoints / 12) === 0 ? (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="9" fill="#737373">
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
              <text x={13} y={1} fill="#737373">{s.name}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
