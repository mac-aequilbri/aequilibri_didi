"use client";

// Segment error boundary for the platform app. Renders inside the org layout
// (so the sidebar/chrome stay), logs through the shared logger, and offers a
// retry without a full reload.

import { useEffect } from "react";
import { logger, errMeta } from "@/lib/logger";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Platform route error", { digest: error.digest, ...errMeta(error) });
  }, [error]);

  return (
    <div className="p-6">
      <div className="ae-card p-8 text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <p className="font-semibold">This page hit an error</p>
        <p className="text-sm text-neutral-500 mt-1 mb-5">
          Something went wrong loading this view. The issue has been logged — you can retry.
        </p>
        <button type="button" onClick={reset} className="btn-ae text-sm">
          Try again
        </button>
        {error.digest && (
          <p className="text-[0.72rem] text-neutral-400 mt-4">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
