"use client";

// Error boundary for the public client portal — the one unauthenticated,
// customer-facing surface. Without this, a data-layer outage would bubble to
// global-error and replace the whole document; here we keep a branded,
// non-alarming card with a retry.

import { useEffect } from "react";
import { logger, errMeta } from "@/lib/logger";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Public portal error", { digest: error.digest, ...errMeta(error) });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="ae-card p-10 max-w-md text-center space-y-4">
        <div className="text-4xl">⏳</div>
        <h1 className="text-xl font-bold text-neutral-800">Temporarily Unavailable</h1>
        <p className="text-neutral-500 text-sm">
          This project portal could not be loaded right now. Please try again in a moment.
        </p>
        <button type="button" onClick={reset} className="btn-ae text-sm">
          Try again
        </button>
        {error.digest && (
          <p className="text-[0.72rem] text-neutral-400">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
