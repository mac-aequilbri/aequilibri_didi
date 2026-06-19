import Link from "next/link";

export interface HeaderAction {
  href: string;
  label: string;
  variant?: "solid" | "outline";
}

export function PageHeader({
  title,
  subtitle,
  actions = [],
}: {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
}) {
  return (
    <div className="page-header flex items-start justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex gap-2">
        {actions.map((a) => (
          <Link key={a.href + a.label} href={a.href} className={a.variant === "outline" ? "btn-ae-outline" : "btn-ae"}>
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export type MetricTone = "neutral" | "good" | "warn" | "bad";

export function MetricCard({
  value,
  label,
  tone = "neutral",
  href,
  hint,
}: {
  value: React.ReactNode;
  label: string;
  /** Semantic colour. Alert tones (warn/bad) go quiet/grey when the value is 0
   *  so a clear metric never shouts like an urgent one. */
  tone?: MetricTone;
  /** When set, the whole card becomes a navigable link. */
  href?: string;
  hint?: string;
}) {
  const isAlert = tone === "warn" || tone === "bad";
  const quiet = isAlert && (value === 0 || value === "0");
  const toneClass = quiet ? "metric-quiet" : `metric-${tone}`;
  const inner = (
    <>
      <div className={`value ${toneClass}`}>{value}</div>
      <div className="label">{label}</div>
      {hint && <div className="metric-hint">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="metric-card metric-card-link">
      {inner}
    </Link>
  ) : (
    <div className="metric-card">{inner}</div>
  );
}

export interface AttentionItem {
  label: string;
  href: string;
  tone?: "warn" | "bad";
}

/** "What needs me" strip for dashboards — render only when items.length > 0. */
export function AttentionBanner({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="attention-banner" role="status">
      <span className="attention-banner-title">Needs your attention</span>
      <div className="attention-banner-items">
        {items.map((it) => (
          <Link
            key={it.href + it.label}
            href={it.href}
            className={`attention-chip attention-${it.tone ?? "warn"}`}
          >
            {it.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

const KNOWN = new Set([
  "draft", "active", "complete", "overdue", "pending", "confirmed",
  "sent", "approved", "accepted", "rejected", "cancelled",
  "executed", "expired", "failed",
]);

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const cls = KNOWN.has(key) ? `status-${key}` : "status-draft";
  return <span className={`status-badge ${cls}`}>{status}</span>;
}
