// Root 404 — replaces Next's unstyled default for every notFound() call and
// unknown URL. Kept dependency-free (no org context: a 404 can fire anywhere,
// including outside the platform shell).

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="ae-card p-10 max-w-md text-center space-y-4">
        <div className="text-4xl">🔎</div>
        <h1 className="text-xl font-bold text-neutral-800">Page Not Found</h1>
        <p className="text-neutral-500 text-sm">
          This page doesn&apos;t exist or may have been moved. Check the address, or head back to
          the app.
        </p>
        <Link href="/app" className="btn-ae text-sm inline-block">
          Go to the app
        </Link>
      </div>
    </div>
  );
}
