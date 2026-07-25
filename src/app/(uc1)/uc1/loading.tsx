// Shared loading skeleton for UC1 routes — previously navigations flashed a
// blank document while the (often heavy) server work ran.

export default function Uc1Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse" aria-busy="true" role="status">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-64 rounded bg-neutral-200" />
      <div className="h-40 rounded bg-neutral-100" />
      <div className="h-40 rounded bg-neutral-100" />
    </div>
  );
}
