// Shared loading skeleton for the register list windows. Every list is
// force-dynamic against Airtable (1–11s reads); without a loading boundary,
// navigating between sibling registers freezes the old page for the full
// fetch. Each list route's loading.tsx re-exports this.
export function ListSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="p-6" aria-busy="true" aria-label={label}>
      <div className="page-header">
        <div className="skeleton h-7 w-56 mb-3" />
        <div className="skeleton h-4 w-80" />
      </div>
      <div className="ae-card p-5 space-y-3 mt-6">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="skeleton h-4" style={{ width: `${94 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}
