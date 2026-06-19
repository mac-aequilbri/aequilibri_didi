// Shared loading skeleton for every org route. App Router shows this via the
// layout's Suspense boundary while a page's server data resolves, so navigation
// lands on a structured placeholder instead of a blank flash.

export default function Loading() {
  return (
    <div className="p-6" aria-busy="true" aria-label="Loading">
      <div className="page-header">
        <div className="skeleton h-7 w-56 mb-3" />
        <div className="skeleton h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="metric-card">
            <div className="skeleton h-8 w-12 mx-auto mb-2" />
            <div className="skeleton h-3 w-24 mx-auto" />
          </div>
        ))}
      </div>
      <div className="ae-card p-5 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-4" style={{ width: `${92 - i * 11}%` }} />
        ))}
      </div>
    </div>
  );
}
