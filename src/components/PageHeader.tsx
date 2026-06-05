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

export function MetricCard({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="metric-card">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

const KNOWN = new Set([
  "draft", "active", "complete", "overdue", "pending", "confirmed",
  "sent", "approved", "accepted", "rejected", "cancelled",
]);

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const cls = KNOWN.has(key) ? `status-${key}` : "status-draft";
  return <span className={`status-badge ${cls}`}>{status}</span>;
}
