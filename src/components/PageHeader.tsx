import Link from "next/link";
import { OrgLogo } from "./OrgLogo";

export interface HeaderAction {
  href: string;
  label: string;
  variant?: "solid" | "outline";
}

export function PageHeader({
  title,
  subtitle,
  actions = [],
  logo,
}: {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
  /** Client logo (data URL) shown beside the title — used where the title is
   *  the organisation's name (e.g. the org dashboard). */
  logo?: string;
}) {
  return (
    <div className="page-header flex items-start justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {logo && <OrgLogo logo={logo} name={title} size={40} />}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
        </div>
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

// Every status the platform emits, mapped to one of the existing tone classes.
// Grouping by meaning (not per-status classes) keeps the CSS small and means a
// new status only needs a line here. Unknown values fall back to the muted draft
// tone rather than rendering grey-by-accident.
const STATUS_TONE: Record<string, string> = {
  // resolved / healthy → green
  active: "active", in_progress: "active", done: "active", mitigated: "active",
  confirmed: "confirmed", approved: "approved", accepted: "accepted",
  sent: "sent", executed: "executed",
  // finished / closed → blue
  complete: "complete", closed: "complete",
  // in-flight / needs attention → amber
  pending: "pending", open: "pending", submitted: "pending", proposed: "pending", intake: "pending", pending_routing: "pending",
  // negative → red
  overdue: "overdue", rejected: "rejected", cancelled: "cancelled", failed: "failed",
  // inert → muted
  draft: "draft", deferred: "draft", superseded: "draft", expired: "expired", captured: "draft", classified: "draft", uploaded: "draft", generated: "active", analyzed: "active",
  inactive: "draft",
  // RAG values → traffic-light tones
  green: "active", amber: "pending", red: "overdue",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_TONE[status.toLowerCase()] ?? "draft";
  return <span className={`status-badge status-${cls}`}>{status.replace(/_/g, " ")}</span>;
}

/** Guided empty state — an icon, what-this-is line, and an optional first action.
 *  Renders fine inside a spanning table cell or a card. */
export function EmptyState({
  icon = "✶",
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="ae-empty">
      <div className="ae-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="ae-empty-title">{title}</p>
      {hint && <p className="ae-empty-hint">{hint}</p>}
      {action && (
        <Link href={action.href} className="btn-ae ae-empty-action">
          {action.label}
        </Link>
      )}
    </div>
  );
}
