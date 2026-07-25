"use client";

// Segment error boundary for the legacy UC1 roofing app. UC1 carries the
// heaviest server work (lidar/geotiff/solar analysis); without this boundary
// any failure escaped to global-error and replaced the whole document.

import { useEffect } from "react";
import { logger, errMeta } from "@/lib/logger";

export default function Uc1Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("UC1 route error", { digest: error.digest, ...errMeta(error) });
  }, [error]);

  return (
    <div className="p-6">
      <div className="ae-card p-8 text-center max-w-lg mx-auto">
        <div className="text-3xl mb-2">⚠️</div>
        <p className="font-semibold">This page hit an error</p>
        <p className="text-sm text-neutral-500 mt-1 mb-5">
          Something went wrong loading this view. The issue has been logged — you can retry.
        </p>
        <button type="button" onClick={reset} className="btn-ae text-sm">
          Try again
        </button>
        {error.digest && (
          <p className="text-[0.72rem] text-neutral-500 mt-4">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
