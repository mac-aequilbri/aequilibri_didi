// Loading skeleton for the Action Hub and its nested pages. Without this
// boundary, navigating detail ↔ list keeps the OLD page frozen on screen for
// the full force-dynamic fetch (1–11s against Airtable) — after Save the
// return trip looked like it never happened. The [org]/loading.tsx fallback
// only covers entering the org segment, not navigation inside it.

export default function Loading() {
  return (
    <div className="p-6" aria-busy="true" aria-label="Loading actions">
      <div className="page-header">
        <div className="skeleton h-7 w-56 mb-3" />
        <div className="skeleton h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="metric-card">
            <div className="skeleton h-8 w-12 mx-auto mb-2" />
            <div className="skeleton h-3 w-24 mx-auto" />
          </div>
        ))}
      </div>
      <div className="ae-card p-5 space-y-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton h-4" style={{ width: `${94 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
